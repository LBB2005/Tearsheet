// A fake of the window's bridge to the engine (preload/index.ts), so the screens can be tested
// without starting the engine. Every call is a vi.fn that answers like the engine would for a
// returning user who has finished setup: two companies with reports, keys added, Claude Code
// signed in with its safety check passed. A test changes what a call answers with the usual
// vi.fn methods (bridge.getSettings.mockResolvedValue(...)), and sends the engine's notes, the
// menu's commands and a report's Flag link with emit, menu and flag.

import type { DownloadNote } from '../../main/downloads'
import { act } from '@testing-library/react'
import { vi, type Mock } from 'vitest'

import type { MenuCommand } from '../../main/menu'
import type { ViewId } from '../../main/navigation'
import type { CallResult, EngineNotification, TearsheetApi, ToolStatus } from '../../preload/api'
import type { ChartSeries, CompanyRow, LineItem, LinePlan, LineState, PredictionPrices, PredictionSummary, ReportBar, ReportNumbers, ReportResult, ReportSummary, SearchHit, SettingsResult } from '../../shared/protocol'
import { analysts } from './analysts'

export type FakeBridge = { [K in keyof TearsheetApi]: Mock<TearsheetApi[K]> }

export const ok = <T>(result: T): CallResult<T> => ({ ok: true, result })
export const fail = (message: string, code?: string): CallResult<never> => ({ ok: false, error: { message, code } })

// ---------- what the engine answers with ----------

export const TOOLS: ToolStatus[] = [
  { kind: 'claude', name: 'Claude Code', path: '/Users/test/.local/bin/claude', available: true, version: '2.1.3 (Claude Code)', loggedIn: true, reason: null },
  { kind: 'codex', name: 'Codex', path: null, available: false, version: null, loggedIn: null, reason: 'Not found on this Mac' }
]

export function settings(over: Partial<SettingsResult> = {}): SettingsResult {
  return {
    keys: { massive: 'set', fred: 'set', alphavantage: 'missing' },
    rejected_keys: [],
    raw_bytes: 120_000_000,
    raw_cap: 5,
    backup_dir: '/Users/test/Backups/Tearsheet',
    backup_in_icloud: false,
    primary_tool: 'claude',
    sec_contact_email: 'liam@example.com',
    goal1_round: 1,
    setup_done: true,
    fred_skipped: false,
    services: [
      { name: 'SEC EDGAR', key: 'none', cost: 'Free', sent: 'Requests for company filings, with your contact email' },
      { name: 'Massive', key: 'yours', cost: 'Free plan', sent: 'Tickers, for daily prices' }
    ],
    price_download: { state: 'done', companies_ready: 503, companies: 503 },
    lockdown: { claude: { version: '2.1.3', passed: true, form: 'claude -p', checked_at: '2026-11-01T10:00:00Z', blocked_reason: null } },
    ...over
  }
}

// A first-time user: nothing set up yet.
export function freshSettings(over: Partial<SettingsResult> = {}): SettingsResult {
  return settings({ keys: { massive: 'missing', fred: 'missing' }, sec_contact_email: null, primary_tool: null, setup_done: false, lockdown: {}, price_download: { state: 'no_key', companies_ready: 0, companies: 503 }, ...over })
}

export const COMPANIES: CompanyRow[] = [
  { cik: 320193, ticker: 'AAPL', name: 'Apple Inc.', report_id: 'r-aapl-2', report_date: '2026-11-05', created_at: '2026-11-05T14:00:00Z', reports: 2, report_ids: ['r-aapl-2', 'r-aapl-1'], price: 230.1, price_date: '2026-11-06', since_report: 0.012, rating: 'Buy', official: true, sector: 'Information Technology', pinned: false },
  { cik: 789019, ticker: 'MSFT', name: 'Microsoft Corp', report_id: 'r-msft-1', report_date: '2026-11-03', created_at: '2026-11-03T14:00:00Z', reports: 1, report_ids: ['r-msft-1'], price: 420.5, price_date: '2026-11-06', since_report: -0.03, rating: 'Hold', official: false, sector: 'Information Technology', pinned: false }
]

export const REPORTS: ReportSummary[] = [
  { report_id: 'r-aapl-2', run_id: 'run-a2', cik: 320193, ticker: 'AAPL', name: 'Apple Inc.', created_at: '2026-11-05T14:00:00Z', rating: 'Buy', narrative_complete: true, kept_because: 'official' },
  { report_id: 'r-msft-1', run_id: 'run-m1', cik: 789019, ticker: 'MSFT', name: 'Microsoft Corp', created_at: '2026-11-03T14:00:00Z', rating: 'Hold', narrative_complete: true, kept_because: null },
  { report_id: 'r-aapl-1', run_id: 'run-a1', cik: 320193, ticker: 'AAPL', name: 'Apple Inc.', created_at: '2026-10-01T14:00:00Z', rating: 'Hold', narrative_complete: true, kept_because: null }
]

export const BAR: ReportBar = { close: 230.1, close_date: '2026-11-06', previous_close: 228.4, rating: 'Buy', capped: false, red_flags: [], range: { bear: 190, base: 250, bull: 290 }, percentile: 72, peers: 38 }

// The report's HTML names the frame it was asked for, so a test can tell the frames apart.
export function report(reportId: string, opts: { view?: string; side?: string } = {}): ReportResult {
  const row = REPORTS.find((r) => r.report_id === reportId) ?? REPORTS[0]
  const html = `<html><body><h1>${row.ticker} ${opts.view ?? 'summary'} ${opts.side ?? 'text'}</h1><div class="cl"><p>Revenue grew 6% last year.</p><a class="flag" href="tearsheet://flag/c1">Flag</a></div></body></html>`
  return { report_id: row.report_id, run_id: row.run_id, ticker: row.ticker ?? 'AAPL', cik: row.cik, name: row.name, created_at: row.created_at, narrative_complete: true, kept: 41, bar: BAR, html }
}

export const HITS: SearchHit[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Information Technology', cik: 320193, report_id: 'r-aapl-2', report_date: '2026-11-05', peer_rule: 'Peers: the S&P 500’s Information Technology companies' },
  { ticker: 'NVDA', name: 'NVIDIA Corp', sector: 'Information Technology', cik: 1045810, report_id: null, report_date: null, peer_rule: null },
  { ticker: 'MSFT', name: 'Microsoft Corp', sector: 'Information Technology', cik: 789019, report_id: 'r-msft-1', report_date: '2026-11-03', peer_rule: null }
]

export function search(query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  return HITS.filter((h) => h.ticker.toLowerCase().startsWith(q) || h.name.toLowerCase().startsWith(q))
}

export const PREDICTIONS: PredictionSummary[] = [
  { prediction_id: 'p-aapl', cik: 320193, ticker: 'AAPL', run_at: '2026-08-01T14:00:00Z', rating: 'Buy', bear: 190, base: 250, bull: 290, grades: [], name: 'Apple Inc.', sector: 'Information Technology', share_class: '', score: 72, probability: 0.61, uncertainty: 'medium', report_id: 'rep-aapl', price: 212.4, price_date: '2026-11-06' }
]

// The log's compare chart: each company's total return and the S&P 500 on the chart's days.
export function comparePrices(ciks: number[]): PredictionPrices {
  const days = chart(30).dates
  return { dates: days, spy: days.map((_, i) => 100 + i * 0.1), series: ciks.map((cik) => ({ cik, total: days.map((_, i) => 100 + i * (cik % 7)) })) }
}

// A year of trading days up to Nov 6, 2026, rising gently, with peers, the S&P 500 and filings.
export function chart(days = 260): ChartSeries {
  const dates: string[] = []
  const at = new Date(Date.UTC(2026, 10, 6))
  while (dates.length < days) {
    const wd = at.getUTCDay()
    if (wd !== 0 && wd !== 6) dates.unshift(at.toISOString().slice(0, 10))
    at.setUTCDate(at.getUTCDate() - 1)
  }
  const close = dates.map((_, i) => 180 + i * 0.2 + Math.sin(i / 7) * 4)
  return {
    dates,
    close,
    volume: dates.map((_, i) => 40_000_000 + (i % 9) * 1_000_000),
    total: close.map((c) => c * 1.01),
    peers: close.map((c) => c * 0.9),
    spy: close.map((c) => c * 2.4),
    filings: [{ date: dates[100], form: '10-Q' }, { date: dates[200], form: '10-K' }],
    trigger: 205,
    range: { bear: 190, base: 250, bull: 290 },
    first_date: dates[0]
  }
}

// A report's numbers for the panel's bigger views, with nothing stored but the ticker.
export function numbers(reportId: string): ReportNumbers {
  return {
    report_id: reportId,
    ticker: 'AAPL',
    score_readout: null,
    factors: null,
    metrics: null,
    methods: null,
    price: null,
    estimate: null,
    range: null,
    returns: null,
    red_flags: null,
    red_flags_readout: null,
    economy: null,
    peer_ratings: null,
    claims: null,
    tables: []
  }
}

// The line (several reports one after another): empty until a test adds to it. The engine says
// how the line changes in line_changed notes, which a test sends with emit.
export const EMPTY_LINE: LineState = { waiting: [], writing: null, finished: [], paused: null, limit: 10 }

export function lineItem(ticker: string, over: Partial<LineItem> = {}): LineItem {
  const hit = HITS.find((h) => h.ticker === ticker)
  return { ticker, name: hit?.name ?? `${ticker} Inc.`, official: true, run_id: null, outcome: null, report_id: null, code: null, message: null, ...over }
}

export function line(over: Partial<LineState> = {}): LineState {
  return { ...EMPTY_LINE, ...over }
}

// The engine's check of a typed list: the look-up list's companies are found (MSFT was rated in
// the last 30 days, so it would not be a new official prediction); anything else is left out.
export function linePlan(queries: string[], waiting: LineItem[] = []): LinePlan {
  const items: LineItem[] = []
  const skipped: LinePlan['skipped'] = []
  for (const query of queries) {
    const hit = HITS.find((h) => h.ticker === query.trim().toUpperCase())
    if (hit) items.push(lineItem(hit.ticker, { official: hit.ticker !== 'MSFT' }))
    else skipped.push({ query, reason: `No S&P 500 company matches '${query}'.` })
  }
  return { items, skipped, line: line({ waiting: [...waiting, ...items] }) }
}

// ---------- the fake itself ----------

const listeners = {
  note: new Set<(n: EngineNotification) => void>(),
  menu: new Set<(c: MenuCommand) => void>(),
  flag: new Set<(p: { claimId: string }) => void>(),
  open: new Set<(p: { view: ViewId; item: string | null }) => void>(),
  download: new Set<(n: DownloadNote) => void>()
}

const listen = <T>(set: Set<(x: T) => void>) => (fn: (x: T) => void) => {
  set.add(fn)
  return () => {
    set.delete(fn)
  }
}

// The sidebar's marks, kept like the engine keeps them (report_marks.py): hidden reports leave
// the company list and the list of reports, an erased one is gone, and pins stick.
function marks() {
  const hidden = new Set<string>()
  const erased = new Set<string>()
  const pinned = new Set<number>()
  const companies = (): CompanyRow[] =>
    COMPANIES.flatMap((c) => {
      const ids = c.report_ids.filter((id) => !hidden.has(id) && !erased.has(id))
      if (ids.length === 0) return []
      const newest = REPORTS.find((r) => r.report_id === ids[0])
      const at = newest?.created_at ?? c.created_at
      return [{ ...c, report_id: ids[0], report_ids: ids, reports: ids.length, created_at: at, report_date: at.slice(0, 10), pinned: pinned.has(c.cik) }]
    })
  const reports = (wantHidden: boolean) => REPORTS.filter((r) => !erased.has(r.report_id) && hidden.has(r.report_id) === wantHidden)
  const keeps = (id: string) => REPORTS.find((r) => r.report_id === id)?.kept_because ?? null
  return { hidden, erased, pinned, companies, reports, keeps }
}

function makeBridge(): FakeBridge {
  const m = marks()
  return {
    runReport: vi.fn<TearsheetApi['runReport']>(async (query: string) => ok({ run_id: 'run-new', ticker: query.toUpperCase(), name: search(query)[0]?.name ?? null })),
    cancel: vi.fn<TearsheetApi['cancel']>(async () => ok({ ok: true })),
    resume: vi.fn<TearsheetApi['resume']>(async () => ok({ run_id: 'run-new', ticker: null, name: null })),
    getReport: vi.fn<TearsheetApi['getReport']>(async (reportId: string, opts?: { view?: string; side?: string }) => ok(report(reportId, opts))),
    listCompanies: vi.fn<TearsheetApi['listCompanies']>(async () => ok(m.companies())),
    searchCompanies: vi.fn<TearsheetApi['searchCompanies']>(async (query: string) => ok(search(query))),
    getChart: vi.fn<TearsheetApi['getChart']>(async () => ok(chart())),
    getReportNumbers: vi.fn<TearsheetApi['getReportNumbers']>(async (reportId: string) => ok(numbers(reportId))),
    getAnalysts: vi.fn<TearsheetApi['getAnalysts']>(async (reportId: string) => ok(analysts(reportId))),
    fetchHistory: vi.fn<TearsheetApi['fetchHistory']>(async () => ok({ first_date: '2021-11-08', days: 1260 })),
    checkKey: vi.fn<TearsheetApi['checkKey']>(async (service: 'massive' | 'fred') => ok({ proof: service === 'massive' ? 'Works: AAPL closed at $230.10 on Nov 6' : 'Works: inflation was 2.9% in September' })),
    runSafetyCheck: vi.fn<TearsheetApi['runSafetyCheck']>(async () => ok({ started: true })),
    openTerminal: vi.fn<TearsheetApi['openTerminal']>(async () => undefined),
    openExternal: vi.fn<TearsheetApi['openExternal']>(async () => true),
    about: vi.fn<TearsheetApi['about']>(async () => ({ app: '0.1.0', engine: '0.1.0', macos: '26.1', electron: '33.2.0' })),
    sendFeedback: vi.fn<TearsheetApi['sendFeedback']>(async () => true),
    find: vi.fn<TearsheetApi['find']>(async () => undefined),
    stopFind: vi.fn<TearsheetApi['stopFind']>(async () => undefined),
    setLook: vi.fn<TearsheetApi['setLook']>(async () => true),
    openTheme: vi.fn<TearsheetApi['openTheme']>(async () => ({ ok: false as const, cancelled: true as const })),
    saveTheme: vi.fn<TearsheetApi['saveTheme']>(async () => ({ ok: false as const, cancelled: true as const })),
    onMenu: vi.fn<TearsheetApi['onMenu']>(listen(listeners.menu)),
    listReports: vi.fn<TearsheetApi['listReports']>(async (_limit?: number, hidden?: boolean) => ok(m.reports(Boolean(hidden)))),
    hideReports: vi.fn<TearsheetApi['hideReports']>(async (ids: string[]) => {
      const found = ids.filter((id) => REPORTS.some((r) => r.report_id === id) && !m.erased.has(id))
      found.forEach((id) => m.hidden.add(id))
      return ok({ hidden: found, erasable: found.filter((id) => m.keeps(id) === null) })
    }),
    showReports: vi.fn<TearsheetApi['showReports']>(async (ids: string[]) => {
      const shown = ids.filter((id) => m.hidden.delete(id))
      return ok({ shown })
    }),
    eraseReports: vi.fn<TearsheetApi['eraseReports']>(async (ids: string[]) => {
      const erased = ids.filter((id) => m.hidden.has(id) && m.keeps(id) === null)
      erased.forEach((id) => {
        m.hidden.delete(id)
        m.erased.add(id)
      })
      return ok({ erased, kept: ids.filter((id) => !erased.includes(id)) })
    }),
    pinCompany: vi.fn<TearsheetApi['pinCompany']>(async (cik: number, pin: boolean) => {
      if (pin) m.pinned.add(cik)
      else m.pinned.delete(cik)
      return ok({ ok: true })
    }),
    listPredictions: vi.fn<TearsheetApi['listPredictions']>(async () => ok(PREDICTIONS)),
    predictionPrices: vi.fn<TearsheetApi['predictionPrices']>(async (ciks: number[]) => ok(comparePrices(ciks))),
    saveCsv: vi.fn<TearsheetApi['saveCsv']>(async (name: string) => ({ ok: true as const, name, path: `/Users/liam/Downloads/${name}` })),
    flagClaim: vi.fn<TearsheetApi['flagClaim']>(async () => ok({ review_id: 'rv-1' })),
    rereadFiling: vi.fn<TearsheetApi['rereadFiling']>(async () => ok({ deleted: 3 })),
    getTools: vi.fn<TearsheetApi['getTools']>(async () => TOOLS),
    setKey: vi.fn<TearsheetApi['setKey']>(async () => ok({ ok: true })),
    getSettings: vi.fn<TearsheetApi['getSettings']>(async () => ok(settings())),
    setSetting: vi.fn<TearsheetApi['setSetting']>(async () => ok({ ok: true })),
    gradeDue: vi.fn<TearsheetApi['gradeDue']>(async () => ok({ graded: 0 })),
    planLine: vi.fn<TearsheetApi['planLine']>(async (queries: string[]) => ok(linePlan(queries))),
    addToLine: vi.fn<TearsheetApi['addToLine']>(async (queries: string[]) => ok(linePlan(queries))),
    getLine: vi.fn<TearsheetApi['getLine']>(async () => ok(EMPTY_LINE)),
    removeFromLine: vi.fn<TearsheetApi['removeFromLine']>(async () => ok(EMPTY_LINE)),
    clearLine: vi.fn<TearsheetApi['clearLine']>(async () => ok(EMPTY_LINE)),
    carryOnLine: vi.fn<TearsheetApi['carryOnLine']>(async () => ok(EMPTY_LINE)),
    onNotification: vi.fn<TearsheetApi['onNotification']>(listen(listeners.note)),
    onFlagRequested: vi.fn<TearsheetApi['onFlagRequested']>(listen(listeners.flag)),
    onOpenView: vi.fn<TearsheetApi['onOpenView']>(listen(listeners.open)),
    onDownload: vi.fn<TearsheetApi['onDownload']>(listen(listeners.download)),
    showDownload: vi.fn<TearsheetApi['showDownload']>(async () => true)
  }
}

export let bridge: FakeBridge = makeBridge()

// Before each test (setup.ts): a fresh fake on window.tearsheet, with no listeners.
export function installBridge(): FakeBridge {
  listeners.note.clear()
  listeners.menu.clear()
  listeners.flag.clear()
  listeners.open.clear()
  listeners.download.clear()
  bridge = makeBridge()
  Object.defineProperty(window, 'tearsheet', { configurable: true, value: bridge })
  return bridge
}

// The engine sends a note (progress, report_ready, safety_done, engine_restarted…).
export function emit(method: string, params: object = {}): void {
  act(() => {
    for (const fn of listeners.note) fn({ method, params: params as Record<string, unknown> })
  })
}

// A menu item or its shortcut (⌘N, ⌘K, ⌘3…).
export function menu(command: MenuCommand): void {
  act(() => {
    for (const fn of listeners.menu) fn(command)
  })
}

// A Flag link clicked inside the report's frame.
export function flag(claimId: string): void {
  act(() => {
    for (const fn of listeners.flag) fn({ claimId })
  })
}

// A report link (tearsheet://open/…) clicked inside the report's frame.
export function openView(view: ViewId, item: string | null = null): void {
  act(() => {
    for (const fn of listeners.open) fn({ view, item })
  })
}

// How a download from the end of the report went (main/downloads.ts).
export function download(note: DownloadNote): void {
  act(() => {
    for (const fn of listeners.download) fn(note)
  })
}
