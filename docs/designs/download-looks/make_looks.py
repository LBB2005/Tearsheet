"""Throwaway spike: five sample looks (PDF page 1 + a cover slide) from Liam's saved JPM report.

Reads jpm.json (pulled read-only from a copy of the data), writes look-N.html and slide-N.html.
Every number comes from the saved report; nothing is invented except labels.
"""

import html
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).parent
D = json.loads((HERE / "jpm.json").read_text())
N = D["numbers"]
esc = html.escape

NAME = "JPMorgan Chase & Co."  # the stored SEC name is "JPMORGAN CHASE & CO"; the build needs a display name
TICK = D["ticker"]
PRICE = N["price"]["value"]
PDATE = N["price"]["date"]
BEAR, BASE, BULL = N["range"]["bear"], N["range"]["base"], N["range"]["bull"]
VALUE = N["estimate"]["value"]
UP = BASE / PRICE - 1
RATING = N["rating"]["call"]
UNC = N["rating"]["uncertainty"]
PCT = N["score"]["percentile"]
PEERS = N["peer_ratings"]
NPEERS = sum(PEERS.values())
RET = N["returns_12m"]
DATE = "8 Nov 2026"
HORIZON = "Nov 2027"


def money(v):
    return f"${v:,.2f}"


def ordinal(k):
    return f"{k}{'th' if k % 100 in (11, 12, 13) else {1: 'st', 2: 'nd', 3: 'rd'}.get(k % 10, 'th')}"


# --- the Tearsheet mark (same drawing as app/src/renderer/mark/drawing.ts, full size) ---------
def squircle(cx=512, cy=512, size=824, n=5, steps=160):
    a = size / 2
    pts = []
    for i in range(steps):
        t = i / steps * math.tau
        c, s = math.cos(t), math.sin(t)
        x = cx + a * math.copysign(abs(c) ** (2 / n), c)
        y = cy + a * math.copysign(abs(s) ** (2 / n), s)
        pts.append(f"{x:.1f} {y:.1f}")
    return "M" + "L".join(pts) + "Z"


SQ = squircle()


def mark(size, uid):
    d = "M300 700L420 594L512 660L740 446"
    return (
        f'<svg class="mark" width="{size}" height="{size}" viewBox="0 0 1024 1024" aria-hidden="true">'
        f'<defs><clipPath id="{uid}c"><path d="{SQ}"/></clipPath>'
        f'<linearGradient id="{uid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2E44"/><stop offset=".55" stop-color="#0B1626"/><stop offset="1" stop-color="#060B14"/></linearGradient>'
        f'<linearGradient id="{uid}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FE3F7" stop-opacity=".26"/><stop offset=".7" stop-color="#7FE3F7" stop-opacity="0"/></linearGradient></defs>'
        f'<path d="{SQ}" fill="url(#{uid}b)"/><g clip-path="url(#{uid}c)">'
        f'<path d="M300 346H600" stroke="#7487A0" stroke-width="40" stroke-linecap="round"/>'
        f'<path d="M300 448H484" stroke="#7487A0" stroke-width="40" stroke-linecap="round"/>'
        f'<path d="{d}L740 930L300 930Z" fill="url(#{uid}a)"/>'
        f'<path d="{d}" fill="none" stroke="#8EEFFF" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></g></svg>'
    )


def mark_outline(size, color, opacity=1.0):
    """A flat one-colour mark for watermarks: the tile outline, two text lines and the price line."""
    d = "M300 700L420 594L512 660L740 446"
    return (
        f'<svg class="wm" width="{size}" height="{size}" viewBox="0 0 1024 1024" aria-hidden="true" style="opacity:{opacity}">'
        f'<path d="{SQ}" fill="none" stroke="{color}" stroke-width="22"/>'
        f'<path d="M300 346H600M300 448H484" stroke="{color}" stroke-width="40" stroke-linecap="round"/>'
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    )


# --- charts -------------------------------------------------------------------------------------
def price_chart(w, h, line, grid, label, font, fz=7, sw=1.4):
    pts = [p["close"] for p in N["weekly"]]
    lo, hi = min(pts + [BEAR]) * 0.98, max(pts) * 1.02
    lo, hi = min(pts) * 0.96, max(pts) * 1.04
    xs = [i / (len(pts) - 1) * (w - 6 * fz) for i in range(len(pts))]
    ys = [h - 2 * fz - (p - lo) / (hi - lo) * (h - 3.2 * fz) for p in pts]
    path = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in zip(xs, ys, strict=True))
    ticks = ""
    for v in (300, 330, 360):
        if lo < v < hi:
            y = h - 2 * fz - (v - lo) / (hi - lo) * (h - 3.2 * fz)
            ticks += f'<line x1="0" x2="{w - 6 * fz}" y1="{y:.1f}" y2="{y:.1f}" stroke="{grid}" stroke-width=".6"/><text x="{w - 5.4 * fz}" y="{y + 3:.1f}" fill="{label}" font-size="{fz}" font-family="{font}">${v}</text>'
    months = f'<text x="0" y="{h - 2}" fill="{label}" font-size="{fz}" font-family="{font}">Nov 2025</text><text x="{w - 6 * fz}" y="{h - 2}" fill="{label}" font-size="{fz}" font-family="{font}" text-anchor="end">Nov 2026</text>'
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" aria-hidden="true">{ticks}<path d="{path}" fill="none" stroke="{line}" stroke-width="{sw}" stroke-linejoin="round"/>{months}</svg>'


def range_bar(w, colors, font, label, big=False):
    lo, hi = BEAR * 0.92, BULL * 1.04
    x = lambda v: (v - lo) / (hi - lo) * w  # noqa: E731
    fs = 15 if big else 7
    h = 70 if big else 34
    by = 26 if big else 13
    bh = 12 if big else 6
    out = f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" aria-hidden="true">'
    out += f'<rect x="{x(BEAR):.1f}" y="{by}" width="{x(BULL) - x(BEAR):.1f}" height="{bh}" rx="{bh / 2}" fill="{colors["band"]}"/>'
    for v, c, name in ((BEAR, colors["bear"], "Bear"), (BASE, colors["base"], "Base"), (BULL, colors["bull"], "Bull")):
        out += f'<circle cx="{x(v):.1f}" cy="{by + bh / 2}" r="{bh * 0.62}" fill="{c}"/>'
    for v, c, name, at, anchor in ((BEAR, colors["bear"], "Bear", 0, "start"), (BASE, colors["base"], "Base", w / 2, "middle"), (BULL, colors["bull"], "Bull", w, "end")):
        out += f'<text x="{at:.1f}" y="{by + bh + fs + 5}" fill="{c}" font-size="{fs}" font-weight="700" font-family="{font}" text-anchor="{anchor}">{name} {money(v)}</text>'
    px = x(PRICE)
    out += f'<line x1="{px:.1f}" x2="{px:.1f}" y1="{by - 6}" y2="{by + bh + 2}" stroke="{colors["ink"]}" stroke-width="1.2"/>'
    out += f'<text x="{px:.1f}" y="{by - 8}" fill="{colors["ink"]}" font-size="{fs}" font-family="{font}" text-anchor="middle">Price {money(PRICE)}</text>'
    return out + "</svg>"


# --- the five looks -----------------------------------------------------------------------------
LOOKS = [
    {
        "key": "1-classic",
        "name": "Classic bank",
        "why": "J.P. Morgan's recipe: Times body, Arial labels, steel blue, sidebar on the right.",
        "body": "'Times New Roman', Times, serif",
        "ui": "Arial, Helvetica, sans-serif",
        "ink": "#1A1A1A", "muted": "#595959", "brand": "#2F5F8A", "tint": "#E4ECF4", "fill": "#F3F3F3",
        "chart": "#2F5F8A", "bear": "#C0504D", "base": "#2F5F8A", "bull": "#4F81BD", "band": "#D6E0EA",
        "size": "10pt", "sidebar": "right", "sign": "header",
    },
    {
        "key": "2-modern",
        "name": "Modern research",
        "why": "The research's pick: Charter body, Avenir Next labels, navy rules, wide sidebar.",
        "body": "Charter, 'Iowan Old Style', Georgia, serif",
        "ui": "'Avenir Next', 'Helvetica Neue', sans-serif",
        "ink": "#1A1A1A", "muted": "#595959", "brand": "#0B2D5B", "tint": "#DCE6F2", "fill": "#F2F2F2",
        "chart": "#0B2D5B", "bear": "#D55E00", "base": "#0B2D5B", "bull": "#0072B2", "band": "#DCE6F2",
        "size": "9.5pt", "sidebar": "right", "sign": "priceline",
    },
    {
        "key": "3-swiss",
        "name": "All-sans",
        "why": "Goldman / Morgan Stanley feel: Helvetica Neue throughout, rating as the headline's last word.",
        "body": "'Helvetica Neue', Helvetica, Arial, sans-serif",
        "ui": "'Helvetica Neue', Helvetica, Arial, sans-serif",
        "ink": "#111111", "muted": "#5F6368", "brand": "#00355E", "tint": "#E3EAF1", "fill": "#F4F5F6",
        "chart": "#00355E", "bear": "#B3261E", "base": "#00355E", "bull": "#2E7D9A", "band": "#DCE4EC",
        "size": "9pt", "sidebar": "right", "sign": "watermark",
    },
    {
        "key": "4-datasheet",
        "name": "Independent data sheet",
        "why": "Morningstar / CFRA feel: condensed type, dense data column on the left, one strong accent.",
        "body": "'Avenir Next Condensed', 'Arial Narrow', sans-serif",
        "ui": "'Avenir Next Condensed', 'Arial Narrow', sans-serif",
        "ink": "#1C1C1C", "muted": "#5A5A5A", "brand": "#1F2A36", "tint": "#E8E8E8", "fill": "#F4F4F4",
        "chart": "#0E7490", "bear": "#C2410C", "base": "#1F2A36", "bull": "#0E7490", "band": "#E0E0E0",
        "size": "9pt", "sidebar": "left", "sign": "spine",
    },
    {
        "key": "5-house",
        "name": "Tearsheet house",
        "why": "Tearsheet's own brand on paper: ink letterhead with the glass mark, cyan price-line rules, New York body.",
        "body": "'New York', Charter, Georgia, serif",
        "ui": "'Avenir Next', 'Helvetica Neue', sans-serif",
        "ink": "#0B1626", "muted": "#53637A", "brand": "#0B1626", "tint": "#E3F1F5", "fill": "#F3F6F8",
        "chart": "#0E7490", "bear": "#C2410C", "base": "#0B1626", "bull": "#0E7490", "band": "#D3E9EF",
        "size": "9.5pt", "sidebar": "right", "sign": "letterhead",
    },
]


def notes_and_points():
    """The first claim of each section, with numbered notes in order of first use."""
    notes, items = [], []
    for p in D["points"]:
        nums = []
        for s in p["sources"]:
            notes.append(s)
            nums.append(len(notes))
        items.append((p["section"], p["text"], nums))
    return items, notes


def page_html(L):
    items, _ = notes_and_points()
    sign = L["sign"]
    colors = {"band": L["band"], "bear": L["bear"], "base": L["base"], "bull": L["bull"], "ink": L["ink"]}
    head_sig = ""
    if sign == "header":
        head_sig = f'<div class="brandline">{mark(22, "h1")}<span class="wordmark">Tearsheet <b>Research</b></span></div>'
    elif sign == "priceline":
        head_sig = f'<div class="brandline">{mark(20, "h2")}<span class="wordmark">TEARSHEET RESEARCH</span></div>'
    elif sign == "watermark":
        head_sig = '<div class="brandline"><span class="wordmark">Tearsheet Research</span></div>'
    elif sign == "spine":
        head_sig = '<div class="brandline"><span class="wordmark">TEARSHEET · INDEPENDENT RESEARCH</span></div>'
    elif sign == "letterhead":
        head_sig = f'<div class="letter">{mark(30, "h5")}<div><span class="wordmark">Tearsheet</span><span class="sub">Research · Company note</span></div><span class="ldate">{DATE}</span></div>'

    if sign == "watermark":
        headline = f"Base case {money(BASE)}, {UP:.1%} above today’s price, on very high uncertainty; <span class='rw'>{RATING}</span>"
    else:
        headline = f"{RATING}: base case {money(BASE)} by {HORIZON}, {UP:.1%} above today’s price, with {UNC} uncertainty"

    summary = (
        f"{TICK} scores in the {ordinal(PCT)} percentile of its {NPEERS}-company peer group. The price is "
        f"{money(PRICE)} against an estimated value of {money(VALUE)}, and the 12-month range runs from "
        f"{money(BEAR)} to {money(BULL)}."
    )
    pts = "".join(
        f'<li><b>{esc(sec)}.</b> {esc(text)}<sup>{",".join(str(n) for n in nums)}</sup></li>' for sec, text, nums in items
    )
    methods = "".join(
        f"<tr><td>{esc({'RESIDUAL_INCOME': 'Residual income', 'PE': 'P/E vs peers', 'DCF': 'DCF'}.get(m['method'], m['method']))}</td><td class='n'>{money(m['value'])}</td></tr>"
        for m in N["methods"]
    )
    factors = "".join(
        f"<tr><td>{esc(f['name'].capitalize())}</td><td class='n'>{f['percentile']}</td><td class='n'>{f['weight']:.1%}</td></tr>"
        for f in N["factors"]
    )
    side = f"""
<aside class="side">
  <div class="rbox"><span class="rl">Rating</span><span class="rv">{RATING.upper()}</span><span class="rn">vs peers, 12 months</span></div>
  <dl class="kv">
    <dt>Base case, {HORIZON}</dt><dd>{money(BASE)}</dd>
    <dt>Price ({PDATE})</dt><dd>{money(PRICE)}</dd>
    <dt>Upside to base case</dt><dd>{UP:+.1%}</dd>
    <dt>Estimated value</dt><dd>{money(VALUE)}</dd>
    <dt>Uncertainty</dt><dd>{UNC.capitalize()}</dd>
  </dl>
  <div class="rangebox"><div class="h">12-month range</div>{range_bar(186, colors, L["ui"], L["muted"])}</div>
  <dl class="kv">
    <dt>Ticker</dt><dd>{TICK}</dd>
    <dt>Sector</dt><dd>Financials (bank)</dd>
    <dt>Score</dt><dd>{ordinal(PCT)} percentile</dd>
    <dt>Peer ratings</dt><dd>{PEERS['Buy']} Buy · {PEERS['Hold']} Hold · {PEERS['Sell']} Sell</dd>
    <dt>52-week range</dt><dd>{money(D['low52'])}–{money(D['high52'])}</dd>
  </dl>
  <div class="h">Total return, past 12 months</div>
  <table class="t"><tr><td>{TICK}</td><td class="n">{RET['company']:.1f}%</td></tr><tr><td>Peer group</td><td class="n">{RET['peers']:.1f}%</td></tr><tr><td>S&amp;P 500 (SPY)</td><td class="n">{RET['spy']:.1f}%</td></tr></table>
  <div class="h">As of</div>
  <p class="asof">Report {DATE}. Prices {PDATE}. Filings to 30 Sep 2026 (10-Q).</p>
</aside>"""

    main = f"""
<section class="main">
  {'' if sign == 'letterhead' else f'<div class="kicker">Company note · {DATE}</div>'}
  <h1>{esc(NAME)} <span class="tk">({TICK})</span></h1>
  <h2>{headline}</h2>
  {'<div class="pl"></div>' if sign in ('priceline', 'letterhead') else ''}
  <p class="sum">{esc(summary)}</p>
  <h3>Key points</h3>
  <ol class="kp">{pts}</ol>
  <div class="ex">
    <div class="ext">Exhibit 1: {TICK} share price, past 12 months</div>
    <div class="exu">US$ per share, weekly closes</div>
    {price_chart(466 if L['sidebar'] == 'right' else 436, 92, L['chart'], '#D9D9D9', L['muted'], L['ui'])}
    <div class="src">Source: Tearsheet price store (Massive). Prices to {PDATE}.</div>
  </div>
  <div class="twin">
    <div class="ex">
      <div class="ext">Exhibit 2: Value per share by method</div>
      <table class="t"><tr><th>Method</th><th class="n">US$</th></tr><tr><td>DCF</td><td class="n">n/m (bank)</td></tr>{methods}<tr class="tot"><td>Estimated value (median)</td><td class="n">{money(VALUE)}</td></tr></table>
      <div class="src">Source: company filings (SEC EDGAR), Tearsheet calculations.</div>
    </div>
    <div class="ex">
      <div class="ext">Exhibit 3: Score factors vs peers</div>
      <table class="t"><tr><th>Factor</th><th class="n">Pctile</th><th class="n">Weight</th></tr>{factors}</table>
      <div class="src">Source: Tearsheet calculations, {NPEERS} peers.</div>
    </div>
  </div>
</section>"""

    body = (side + main) if L["sidebar"] == "left" else (main + side)
    wm = f'<div class="wmark">{mark_outline(300, L["brand"], 0.05)}</div>' if sign == "watermark" else ""
    spine = '<div class="spine">TEARSHEET</div>' if sign == "spine" else ""
    foot = (
        f'<footer><span class="fl">{mark(11, "f" + L["key"][0]) if sign != "watermark" else ""}Tearsheet Research · Research data, not investment advice. '
        f"Made by software from public filings and prices; check the sources. See page 7 for sources and important disclosures.</span>"
        f'<span class="pg">Page 1 of 7</span></footer>'
    )
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{L['name']}</title><style>{css(L)}</style></head>
<body><div class="page s-{sign} side-{L['sidebar']}">{wm}{spine}
<header class="top">{head_sig}{'' if sign == 'letterhead' else f'<span class="hd">{TICK} · {DATE}</span>'}</header>
<div class="grid">{body}</div>{foot}</div></body></html>"""


def css(L):
    left = L["sidebar"] == "left"
    return f"""
@page {{ size: letter; margin: 0; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; background: #fff; }}
body {{ color: {L['ink']}; font-family: {L['body']}; font-size: {L['size']}; line-height: 1.38; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-variant-numeric: tabular-nums; }}
.page {{ position: relative; width: 8.5in; height: 11in; padding: 0.55in 0.6in 0.5in; overflow: hidden; }}
.s-spine .page, .page.s-spine {{ padding-left: 0.95in; }}
.top {{ display: flex; justify-content: space-between; align-items: center; font: 7.5pt/1 {L['ui']}; color: {L['muted']}; border-bottom: 1pt solid {L['brand']}; padding-bottom: 6pt; margin-bottom: 12pt; }}
.brandline {{ display: flex; align-items: center; gap: 6pt; }}
.wordmark {{ font: 600 9pt/1 {L['ui']}; color: {L['brand']}; letter-spacing: .02em; }}
.wordmark b {{ font-weight: 400; color: {L['muted']}; }}
.mark {{ display: inline-block; vertical-align: middle; }}
.grid {{ display: grid; grid-template-columns: {'2.15in 1fr' if left else '1fr 2.2in'}; gap: 0.22in; }}
.kicker {{ font: 600 7.5pt/1 {L['ui']}; text-transform: uppercase; letter-spacing: .08em; color: {L['muted']}; margin-bottom: 6pt; }}
h1 {{ font: 700 20pt/1.1 {L['ui']}; color: {L['brand']}; margin: 0 0 6pt; }}
h1 .tk {{ font-weight: 400; color: {L['muted']}; }}
h2 {{ font: 500 12.5pt/1.25 {L['ui']}; margin: 0 0 8pt; color: {L['ink']}; }}
h2 .rw {{ font-weight: 700; color: {L['brand']}; }}
h3, .h {{ font: 700 8.5pt/1.2 {L['ui']}; color: {L['brand']}; text-transform: uppercase; letter-spacing: .05em; margin: 10pt 0 4pt; }}
.sum {{ font-weight: 700; margin: 0 0 4pt; }}
.kp {{ margin: 0; padding-left: 1.1em; }}
.kp li {{ margin: 0 0 4pt; }}
sup {{ font: 6pt/0 {L['ui']}; color: {L['brand']}; }}
.ex {{ margin-top: 10pt; break-inside: avoid; }}
.ext {{ font: 700 8pt/1.2 {L['ui']}; }}
.exu {{ font: 7pt/1.3 {L['ui']}; color: {L['muted']}; margin-bottom: 2pt; }}
.src {{ font: italic 6.5pt/1.3 {L['ui']}; color: {L['muted']}; margin-top: 3pt; }}
.twin {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0.18in; }}
.t {{ width: 100%; border-collapse: collapse; font: 7.5pt/1.35 {L['ui']}; border-top: 1pt solid {L['brand']}; border-bottom: 1pt solid {L['brand']}; margin-top: 3pt; }}
.t th {{ text-align: left; font-weight: 700; background: {L['tint']}; padding: 2pt 4pt; border-bottom: 1pt solid {L['brand']}; }}
.t td {{ padding: 2pt 4pt; border-bottom: .5pt solid #BFBFBF; }}
.t tr:last-child td {{ border-bottom: 0; }}
.t .n {{ text-align: right; }}
.t .tot td {{ font-weight: 700; border-top: 1pt solid {L['ink']}; }}
.side {{ background: {L['fill']}; padding: 9pt 10pt; font: 8pt/1.35 {L['ui']}; align-self: start; }}
.rbox {{ border: 1pt solid {L['brand']}; padding: 6pt 8pt; display: grid; grid-template-columns: 1fr auto; align-items: baseline; background: #fff; }}
.rl {{ font: 600 7pt/1 {L['ui']}; text-transform: uppercase; letter-spacing: .08em; color: {L['muted']}; }}
.rv {{ font: 700 15pt/1 {L['ui']}; color: {L['brand']}; letter-spacing: .04em; grid-row: span 2; }}
.rn {{ font: 7pt/1.2 {L['ui']}; color: {L['muted']}; }}
.kv {{ display: grid; grid-template-columns: 1fr auto; gap: 2pt 6pt; margin: 8pt 0 0; }}
.kv dt {{ color: {L['muted']}; }}
.kv dd {{ margin: 0; text-align: right; font-weight: 600; }}
.rangebox {{ margin-top: 8pt; }}
.rangebox .h {{ margin-top: 0; }}
.asof {{ font-size: 7pt; color: {L['muted']}; margin: 0; }}
footer {{ position: absolute; left: 0.6in; right: 0.6in; bottom: 0.32in; display: flex; justify-content: space-between; gap: 12pt; font: 6.5pt/1.35 {L['ui']}; color: {L['muted']}; border-top: .5pt solid #BFBFBF; padding-top: 4pt; }}
.s-spine footer {{ left: 0.95in; }}
footer .fl {{ display: flex; gap: 4pt; align-items: flex-start; max-width: 6in; }}
.pg {{ white-space: nowrap; }}
/* signatures */
.s-priceline .pl, .s-letterhead .pl {{ height: 3pt; width: 1.6in; background: linear-gradient(90deg, #0E7490, #7FE3F7); border-radius: 2pt; margin: 2pt 0 8pt; }}
.s-priceline .wordmark {{ letter-spacing: .14em; font-size: 7.5pt; }}
.wmark {{ position: absolute; right: -40px; bottom: 40px; pointer-events: none; }}
.spine {{ position: absolute; left: 0; top: 0; bottom: 0; width: 0.42in; background: {L['brand']}; color: #fff; writing-mode: vertical-rl; transform: rotate(180deg); font: 700 11pt/0.42in {L['ui']}; letter-spacing: .5em; text-align: center; }}
.spine::after {{ content: ''; }}
.s-letterhead .top {{ border: 0; padding: 0; margin: -0.55in -0.6in 14pt; }}
.letter {{ display: flex; align-items: center; gap: 9pt; background: #0B1626; color: #fff; padding: 0.22in 0.6in; width: 8.5in; position: relative; }}
.letter::after {{ content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2.5pt; background: linear-gradient(90deg, #0E7490, #7FE3F7 60%, #0B1626); }}
.letter .wordmark {{ color: #fff; font: 600 15pt/1 {L['ui']}; display: block; letter-spacing: .01em; }}
.letter .sub {{ font: 7.5pt/1.6 {L['ui']}; color: #9FB3C8; letter-spacing: .08em; text-transform: uppercase; }}
.letter .ldate {{ margin-left: auto; font: 8pt/1 {L['ui']}; color: #CFE3EE; }}
"""


def slide_html(L, i):
    colors = {"band": L["band"], "bear": L["bear"], "base": L["base"], "bull": L["bull"], "ink": L["ink"]}
    sign = L["sign"]
    brand = {
        "header": f'{mark(26, "s1")}<span>Tearsheet <b>Research</b></span>',
        "priceline": f'{mark(24, "s2")}<span class="caps">TEARSHEET RESEARCH</span>',
        "watermark": "<span>Tearsheet Research</span>",
        "spine": '<span class="caps">TEARSHEET · INDEPENDENT RESEARCH</span>',
        "letterhead": f'{mark(30, "s5")}<span>Tearsheet</span>',
    }[sign]
    pts = [
        f"Scores in the {ordinal(PCT)} percentile of its {NPEERS}-company peer group",
        f"Estimated value {money(VALUE)}: median of residual income and P/E (DCF not used for banks)",
        f"Total return past 12 months {RET['company']:.1f}% vs peers {RET['peers']:.1f}% and S&P 500 {RET['spy']:.1f}%",
    ]
    lis = "".join(f"<li>{esc(p)}</li>" for p in pts)
    wm = f'<div class="wmark">{mark_outline(520, L["brand"], 0.05)}</div>' if sign == "watermark" else ""
    spine = '<div class="spine">TEARSHEET</div>' if sign == "spine" else ""
    dark = sign == "letterhead"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: 13.333in 7.5in; margin: 0; }}
* {{ box-sizing: border-box; }} html, body {{ margin: 0; }}
body {{ font-family: Arial, Helvetica, sans-serif; color: {L['ink']}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.slide {{ position: relative; width: 13.333in; height: 7.5in; background: #fff; padding: 0.5in 0.6in; overflow: hidden; {'padding-left: 1.1in;' if sign == 'spine' else ''} }}
.brand {{ display: flex; align-items: center; gap: 8pt; font: 600 12pt/1 {L['ui']}; color: {'#fff' if dark else L['brand']}; }}
.brand b {{ font-weight: 400; color: {L['muted']}; }}
.brand .caps {{ letter-spacing: .14em; font-size: 10pt; }}
.bar {{ display: flex; justify-content: space-between; align-items: center; {'background:#0B1626; margin: -0.5in -0.6in 0; padding: 0.3in 0.6in;' if dark else f'border-bottom: 1pt solid {L["brand"]}; padding-bottom: 10pt;'} position: relative; }}
.bar .d {{ font: 11pt/1 {L['ui']}; color: {'#CFE3EE' if dark else L['muted']}; }}
{'.bar::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4pt; background: linear-gradient(90deg, #0E7490, #7FE3F7 60%, #0B1626); }' if dark else ''}
.kicker {{ margin-top: 18pt; font: 600 11pt/1 {L['ui']}; letter-spacing: .12em; text-transform: uppercase; color: {L['muted']}; }}
h1 {{ font: 700 36pt/1.1 {L['ui']}; color: {L['brand']}; margin: 8pt 0 6pt; }}
h1 span {{ font-weight: 400; color: {L['muted']}; }}
h2 {{ font: 400 20pt/1.25 {L['ui']}; margin: 0 0 18pt; }}
{'.pl { height: 5pt; width: 2.4in; background: linear-gradient(90deg, #0E7490, #7FE3F7); border-radius: 3pt; margin: -6pt 0 18pt; }' if sign in ('priceline', 'letterhead') else '.pl { display: none; }'}
.cols {{ display: grid; grid-template-columns: 3.6in 1fr; gap: 0.5in; }}
.callbox {{ border: 1.5pt solid {L['brand']}; padding: 12pt 14pt; }}
.callbox .r {{ font: 700 30pt/1 {L['ui']}; color: {L['brand']}; letter-spacing: .04em; }}
.callbox dl {{ display: grid; grid-template-columns: 1fr auto; gap: 4pt 10pt; margin: 10pt 0 0; font: 13pt/1.3 {L['ui']}; }}
.callbox dt {{ color: {L['muted']}; }} .callbox dd {{ margin: 0; font-weight: 700; text-align: right; }}
.right .h {{ font: 700 12pt/1 {L['ui']}; color: {L['brand']}; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6pt; }}
ul {{ margin: 10pt 0 0; padding-left: 1.1em; font: 15pt/1.4 {L['ui']}; }}
.chartrow {{ margin-top: 8pt; }} .h2l {{ font: 700 11pt/1 {L['ui']}; color: {L['brand']}; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4pt; }} li {{ margin-bottom: 6pt; }}
.foot {{ position: absolute; left: {'1.1in' if sign == 'spine' else '0.6in'}; right: 0.6in; bottom: 0.3in; display: flex; justify-content: space-between; font: 8pt/1.3 {L['ui']}; color: {L['muted']}; border-top: .5pt solid #BFBFBF; padding-top: 5pt; }}
.foot i {{ font-style: italic; }}
.wmark {{ position: absolute; right: -60px; bottom: -40px; }}
.spine {{ position: absolute; left: 0; top: 0; bottom: 0; width: 0.6in; background: {L['brand']}; color: #fff; writing-mode: vertical-rl; transform: rotate(180deg); font: 700 14pt/0.6in {L['ui']}; letter-spacing: .6em; text-align: center; }}
</style></head><body><div class="slide">{wm}{spine}
<div class="bar"><div class="brand">{brand}</div><div class="d">Company note · {DATE}</div></div>
<div class="kicker">Recommendation</div>
<h1>{esc(NAME)} <span>({TICK})</span></h1>
<h2>{RATING}: base case {money(BASE)} by {HORIZON}, {UP:.1%} above today’s price</h2>
<div class="pl"></div>
<div class="cols"><div class="callbox"><div class="r">{RATING.upper()}</div><dl>
<dt>Price ({PDATE})</dt><dd>{money(PRICE)}</dd><dt>12-month base case</dt><dd>{money(BASE)}</dd><dt>Upside</dt><dd>{UP:+.1%}</dd><dt>Uncertainty</dt><dd>{UNC.capitalize()}</dd></dl></div>
<div class="right"><div class="h">12-month range</div>{range_bar(620, colors, L['ui'], L['muted'], big=True)}<ul>{lis}</ul></div></div>
<div class="chartrow"><div class="h2l">Share price, past 12 months (US$, weekly closes)</div>{price_chart(1090, 112, L['chart'], '#D9D9D9', L['muted'], L['ui'], fz=12, sw=2.2)}</div>
<div class="foot"><span><i>Source: SEC EDGAR filings, Massive prices to {PDATE}, Tearsheet calculations.</i> Research data, not investment advice.</span><span>Tearsheet Research · 1</span></div>
</div></body></html>"""


if __name__ == "__main__":
    for i, L in enumerate(LOOKS, 1):
        (HERE / f"look-{L['key']}.html").write_text(page_html(L))
        (HERE / f"slide-{L['key']}.html").write_text(slide_html(L, i))
    print("ok", file=sys.stderr)
