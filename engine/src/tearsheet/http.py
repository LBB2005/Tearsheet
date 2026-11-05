"""The shared HTTP client (design item 4).

Every request goes through here: one rate limiter per service, retries, the per-service
check that a response is real data, removal of keys from logged and stored addresses,
request counts per run, and the article-page rules from Technical Plan §9. Only a valid
response is stored in the raw store and passed on.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import socket
import time
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from email.utils import parsedate_to_datetime
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import httpx

from tearsheet import ENGINE_VERSION, config

if TYPE_CHECKING:
    from tearsheet.config import Settings
    from tearsheet.rawstore import RawStore

log = logging.getLogger(__name__)

EASTERN = ZoneInfo("America/New_York")

# Query parameters that carry keys. They are removed from every logged or stored address.
KEY_PARAMS = frozenset({"apikey", "api_key", "key", "token", "access_token"})

RETRY_WAITS_S = (2, 4, 8)
RETRY_AFTER_MAX_S = 60
DATA_TIME_LIMIT_S = 30

PAGE_MAX_BYTES = 5 * 1024 * 1024
PAGE_TIME_LIMIT_S = 20
PAGE_MAX_REDIRECTS = 10
PAYWALL_STATUSES = frozenset({401, 402, 403})
PAGE_USER_AGENT = f"Mozilla/5.0 (compatible; Tearsheet/{ENGINE_VERSION}; personal research reader)"
LOCAL_HOST_SUFFIXES = (".local", ".localhost", ".internal", ".lan", ".home", ".arpa")

# Alpha Vantage answers a rate-limit or key error with status 200 and one of these
# fields. Confirmed in Phase 0.
ALPHAVANTAGE_ERROR_FIELDS = ("Note", "Information", "Error Message")
# Massive's `status` values for a refused call. Confirmed in Phase 0.
MASSIVE_ERROR_STATUSES = frozenset({"ERROR", "NOT_AUTHORIZED"})
# How the Massive key is sent: an Authorization header keeps it out of addresses.
# Confirmed in Phase 0 (otherwise the `apiKey` parameter, which is removed from logs).
MASSIVE_AUTH_HEADER = "Authorization"

# Content types accepted for each kind of expected body.
EXPECTED_TYPES = {
    "json": ("json",),
    "html": ("html",),
    "xml": ("xml",),
    "csv": ("csv", "text/plain", "octet-stream", "excel"),
    "text": ("html", "xml", "text/plain"),
}


# --- errors --------------------------------------------------------------------


class HTTPFailure(Exception):
    """A request that gave no valid data. Nothing was stored."""

    def __init__(self, service: str, url: str, message: str, status: int | None = None):
        self.service = service
        self.url = redact_url(url)
        self.status = status
        super().__init__(f"{service}: {message}" + (f" ({self.url})" if self.url else ""))


class SECBlocked(HTTPFailure):
    """SEC returned 403. The run stops with a plain message."""


class InvalidResponse(HTTPFailure):
    """Status 200, but the body failed the service's check (an error page, a rate-limit note)."""


class DailyLimitReached(HTTPFailure):
    """A service's daily call allowance is used up."""


class PageRejected(Exception):
    """An article page that is not downloaded or not kept. `reason` is shown as "not read"."""

    def __init__(self, url: str, reason: str, status: int | None = None):
        self.url = redact_url(url)
        self.reason = reason
        self.status = status
        super().__init__(f"{reason}: {self.url}")


# --- addresses -------------------------------------------------------------------


def redact_url(url: str) -> str:
    """The address with key parameters removed. Other addresses are returned unchanged."""
    parts = urlsplit(url)
    if not parts.query:
        return url
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    kept = [(k, v) for k, v in pairs if k.lower() not in KEY_PARAMS]
    if len(kept) == len(pairs):
        return url
    return urlunsplit(parts._replace(query=urlencode(kept)))


class _RedactKeys(logging.Filter):
    """httpx logs each request's full address; this removes key parameters from it."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                redact_url(str(arg))
                if isinstance(arg, httpx.URL | str) and "://" in str(arg)
                else arg
                for arg in record.args
            )
        return True


for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).addFilter(_RedactKeys())


def is_local_ip(text: str) -> bool:
    ip = ipaddress.ip_address(text)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def resolve_host(host: str) -> list[str]:
    """The addresses a host name resolves to (an address literal resolves to itself)."""
    try:
        ipaddress.ip_address(host)
        return [host]
    except ValueError:
        pass
    infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    return sorted({str(info[4][0]) for info in infos})


def retry_after_seconds(value: str | None, now: datetime | None = None) -> float | None:
    """A `Retry-After` header in seconds, capped at 60. None when absent or unreadable."""
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            when = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        seconds = (when - (now or datetime.now(UTC))).total_seconds()
    return max(0.0, min(seconds, RETRY_AFTER_MAX_S))


def fred_value(text: str) -> float | None:
    """FRED writes a missing value as "."; it is read as no value."""
    text = text.strip()
    return None if text == "." else float(text)


def eastern_today() -> date:
    return datetime.now(EASTERN).date()


# --- limits ----------------------------------------------------------------------


class RateLimiter:
    """Spaces calls at least `interval_s` apart, across every caller that shares it."""

    def __init__(
        self,
        interval_s: float,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
    ):
        self.interval_s = interval_s
        self._clock = clock
        self._sleep = sleep
        self._next = 0.0
        self._lock = asyncio.Lock()

    @classmethod
    def per_second(cls, calls: float, **kwargs: Any) -> RateLimiter:
        return cls(1.0 / calls, **kwargs)

    @classmethod
    def per_minute(cls, calls: float, **kwargs: Any) -> RateLimiter:
        return cls(60.0 / calls, **kwargs)

    async def wait(self) -> None:
        async with self._lock:
            now = self._clock()
            if now < self._next:
                await self._sleep(self._next - now)
            self._next = max(self._clock(), self._next) + self.interval_s


class DailyCounter:
    """Counts one service's calls per US Eastern day in the settings table.

    The count survives restarts because it lives in the database, not in memory.
    """

    def __init__(
        self,
        settings: Settings,
        service: str,
        limit: int,
        *,
        today: Callable[[], date] = eastern_today,
    ):
        self._settings = settings
        self._key = f"daily_calls:{service}"
        self.service = service
        self.limit = limit
        self._today = today

    def count(self) -> int:
        stored = self._settings.get(self._key)
        if not stored:
            return 0
        day, _, number = stored.partition(" ")
        return int(number) if day == self._today().isoformat() else 0

    def take(self) -> None:
        used = self.count()
        if used >= self.limit:
            raise DailyLimitReached(
                self.service,
                "",
                f"the free plan allows {self.limit} calls a day and today's are used; "
                "they reset at midnight US Eastern time",
            )
        self._settings.set_internal(self._key, f"{self._today().isoformat()} {used + 1}")


# --- responses -------------------------------------------------------------------


@dataclass
class Fetched:
    url: str
    status: int
    content_type: str
    body: bytes
    raw_hash: str

    def json(self) -> Any:
        return json.loads(self.body)

    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


def _looks_like_html(body: bytes) -> bool:
    head = body[:512].lstrip().lower()
    return head.startswith((b"<!doctype html", b"<html", b"<head", b"<body"))


def alphavantage_problem(data: Any) -> str | None:
    if isinstance(data, dict):
        for name in ALPHAVANTAGE_ERROR_FIELDS:
            if name in data:
                return f"Alpha Vantage refused the call (a rate-limit or key error): {data[name]}"
    return None


def massive_problem(data: Any) -> str | None:
    if isinstance(data, dict) and data.get("status") in MASSIVE_ERROR_STATUSES:
        detail = data.get("error") or data.get("message") or data["status"]
        return f"Massive refused the call: {detail}"
    return None


@dataclass
class Service:
    name: str
    limiter: RateLimiter | None = None
    daily: DailyCounter | None = None
    headers: dict[str, str] = field(default_factory=dict)
    check_json: Callable[[Any], str | None] | None = None


def check_body(service: Service, expect: str, content_type: str, body: bytes) -> str | None:
    """Why a status-200 response is not valid data, or None when it is."""
    wanted = EXPECTED_TYPES[expect]
    lowered = content_type.lower()
    if not any(part in lowered for part in wanted):
        return f"expected {expect}, got content type '{content_type or 'none'}'"
    if expect not in ("html", "text") and _looks_like_html(body):
        return f"an HTML page where {expect} was expected"
    if expect == "json":
        try:
            data = json.loads(body)
        except ValueError:
            return "a body that is not valid JSON"
        if service.check_json:
            return service.check_json(data)
    return None


# --- the client --------------------------------------------------------------------


class HttpClient:
    """One client per run. `requests` and `statuses` hold that run's counts."""

    def __init__(
        self,
        rawstore: RawStore,
        run_id: str,
        *,
        settings: Settings | None = None,
        sec_user_agent: str | None = None,
        massive_key: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
        resolver: Callable[[str], Awaitable[list[str]]] = resolve_host,
    ):
        self.run_id = run_id
        self._store = rawstore
        self._sleep = sleep
        self._resolve = resolver
        self._sec_user_agent = sec_user_agent
        self._client = httpx.AsyncClient(
            transport=transport, timeout=DATA_TIME_LIMIT_S, follow_redirects=True
        )
        massive_per_minute = (
            settings.number("massive_calls_per_minute", config.MASSIVE_CALLS_PER_MINUTE)
            if settings
            else config.MASSIVE_CALLS_PER_MINUTE
        )
        self.services = {
            "sec": Service(
                "sec",
                limiter=RateLimiter.per_second(
                    config.SEC_REQUESTS_PER_SECOND, clock=clock, sleep=sleep
                ),
                headers={"User-Agent": sec_user_agent} if sec_user_agent else {},
            ),
            "massive": Service(
                "massive",
                limiter=RateLimiter.per_minute(massive_per_minute, clock=clock, sleep=sleep),
                headers={MASSIVE_AUTH_HEADER: f"Bearer {massive_key}"} if massive_key else {},
                check_json=massive_problem,
            ),
            "alphavantage": Service(
                "alphavantage",
                limiter=RateLimiter.per_second(
                    config.ALPHAVANTAGE_REQUESTS_PER_SECOND, clock=clock, sleep=sleep
                ),
                daily=DailyCounter(settings, "alphavantage", config.ALPHAVANTAGE_CALLS_PER_DAY)
                if settings
                else None,
                check_json=alphavantage_problem,
            ),
            "fred": Service("fred"),
            "ishares": Service("ishares", headers={"User-Agent": PAGE_USER_AGENT}),
        }
        self.requests: Counter[tuple[str, str]] = Counter()
        self.statuses: Counter[tuple[str, int]] = Counter()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> HttpClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def fetch(
        self,
        service: str,
        url: str,
        *,
        kind: str,
        expect: str = "json",
        params: dict[str, Any] | None = None,
    ) -> Fetched:
        """GET one address from a data service, with that service's limits and checks."""
        svc = self.services[service]
        if service == "sec" and not self._sec_user_agent:
            raise config.SettingMissing(
                "SEC asks every program for a contact email. Set yours once with: "
                "tearsheet-engine set-setting sec_contact_email you@example.com"
            )
        full_url = str(httpx.URL(url, params=params)) if params else url
        attempt = 0
        while True:
            if svc.limiter:
                await svc.limiter.wait()
            if svc.daily:
                svc.daily.take()
            self.requests[(service, kind)] += 1
            log.debug("GET %s", redact_url(full_url))
            try:
                response = await self._client.get(full_url, headers=svc.headers)
            except httpx.TransportError as exc:
                if attempt < len(RETRY_WAITS_S):
                    await self._sleep(RETRY_WAITS_S[attempt])
                    attempt += 1
                    continue
                raise HTTPFailure(
                    service,
                    full_url,
                    f"no response after {attempt + 1} tries ({type(exc).__name__})",
                ) from None

            status = response.status_code
            self.statuses[(service, status)] += 1
            if status == 429 or status >= 500:
                if attempt < len(RETRY_WAITS_S):
                    wait = retry_after_seconds(response.headers.get("retry-after"))
                    await self._sleep(RETRY_WAITS_S[attempt] if wait is None else wait)
                    attempt += 1
                    continue
                raise HTTPFailure(
                    service, full_url, f"HTTP {status} after {attempt + 1} tries", status
                )
            if service == "sec" and status == 403:
                raise SECBlocked(
                    service,
                    full_url,
                    "SEC refused the request (HTTP 403). This usually means the contact email "
                    "is missing or SEC has paused requests from this computer for a while. "
                    "The run has stopped",
                    status,
                )
            if status != 200:
                raise HTTPFailure(service, full_url, f"HTTP {status}", status)

            content_type = response.headers.get("content-type", "")
            problem = check_body(svc, expect, content_type, response.content)
            if problem:
                raise InvalidResponse(service, full_url, problem, status)
            raw_hash = self._store.put(
                response.content, full_url, svc.name, content_type, self.run_id
            )
            return Fetched(full_url, status, content_type, response.content, raw_hash)

    # --- article pages (Technical Plan §9) -------------------------------------

    async def fetch_page(
        self,
        url: str,
        *,
        is_allowed: Callable[[str], bool],
        max_bytes: int = PAGE_MAX_BYTES,
        time_limit_s: float = PAGE_TIME_LIMIT_S,
    ) -> Fetched:
        """Download one article page, following redirects one at a time.

        Each address must be https, on the allowlist and not a local or home-network
        address. Raises PageRejected with the reason when a page is not downloaded.
        """
        try:
            return await asyncio.wait_for(
                self._fetch_page(url, is_allowed, max_bytes), time_limit_s
            )
        except TimeoutError:
            raise PageRejected(url, f"took longer than {time_limit_s:g} seconds") from None

    async def _check_page_address(self, url: str, is_allowed: Callable[[str], bool]) -> None:
        parts = urlsplit(url)
        if parts.scheme != "https":
            raise PageRejected(url, "not https")
        host = (parts.hostname or "").lower()
        if not host:
            raise PageRejected(url, "no site in the address")
        if not is_allowed(url):
            raise PageRejected(url, "not on the allowlist")
        if host == "localhost" or host.endswith(LOCAL_HOST_SUFFIXES):
            raise PageRejected(url, "a local or home-network address")
        try:
            ipaddress.ip_address(host)
            addresses = [host]
        except ValueError:
            try:
                addresses = await self._resolve(host)
            except OSError:
                raise PageRejected(url, "the site's name could not be found") from None
        if not addresses or any(is_local_ip(address) for address in addresses):
            raise PageRejected(url, "a local or home-network address")

    async def _fetch_page(
        self, url: str, is_allowed: Callable[[str], bool], max_bytes: int
    ) -> Fetched:
        current = url
        for _ in range(PAGE_MAX_REDIRECTS + 1):
            await self._check_page_address(current, is_allowed)
            self.requests[("article", "page")] += 1
            try:
                async with self._client.stream(
                    "GET", current, headers={"User-Agent": PAGE_USER_AGENT}, follow_redirects=False
                ) as response:
                    status = response.status_code
                    self.statuses[("article", status)] += 1
                    if response.is_redirect:
                        current = urljoin(current, response.headers["location"])
                        continue
                    if status in PAYWALL_STATUSES:
                        raise PageRejected(url, "paywalled", status)
                    if status != 200:
                        raise PageRejected(url, f"refused download (HTTP {status})", status)
                    content_type = response.headers.get("content-type", "")
                    if "html" not in content_type.lower():
                        raise PageRejected(url, f"not a web page ({content_type or 'no type'})")
                    declared = response.headers.get("content-length", "")
                    if declared.isdigit() and int(declared) > max_bytes:
                        raise PageRejected(url, "larger than 5 MB")
                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > max_bytes:
                            raise PageRejected(url, "larger than 5 MB")
                        chunks.append(chunk)
            except httpx.TransportError as exc:
                raise PageRejected(url, f"could not download ({type(exc).__name__})") from None
            body = b"".join(chunks)
            raw_hash = self._store.put(body, current, "article", content_type, self.run_id)
            return Fetched(current, status, content_type, body, raw_hash)
        raise PageRejected(url, "too many redirects")
