// A fake of the window's bridge to the engine (preload/index.ts), so the screens can be tested
// without starting the engine. Every call is a vi.fn that answers like the engine would for a
// returning user who has finished setup: two companies with reports, keys added, Claude Code
// signed in with its safety check passed. A test changes what a call answers with the usual
// vi.fn methods (bridge.getSettings.mockResolvedValue(...)), and sends the engine's notes, the
// menu's commands and a report's Flag link with emit, menu and flag.

import { act } from '@testing-library/react'
import { vi, type Mock } from 'vitest'

import type { MenuCommand } from '../../main/menu'
import type { CallResult, EngineNotification, TearsheetApi, ToolStatus } from '../../preload/api'
import type { ChartSeries, CompanyRow, PredictionSummary, ReportBar, ReportResult, ReportSummary, SearchHit, SettingsResult } from '../../shared/protocol'

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
  { cik: 320193, ticker: 'AAPL', name: 'Apple Inc.', report_id: 'r-aapl-2', report_date: '2026-11-05', reports: 2, price: 230.1, price_date: '2026-11-06' },
  { cik: 789019, ticker: 'MSFT', name: 'Microsoft Corp', report_id: 'r-msft-1', report_date: '2026-11-03', reports: 1, price: 420.5, price_date: '2026-11-06' }
]

export const REPORTS: ReportSummary[] = [
  { report_id: 'r-aapl-2', run_id: 'run-a2', cik: 320193, ticker: 'AAPL', name: 'Apple Inc.', created_at: '2026-11-05T14:00:00Z', rating: 'Buy', narrative_complete: true },
  { report_id: 'r-msft-1', run_id: 'run-m1', cik: 789019, ticker: 'MSFT', name: 'Microsoft Corp', created_at: '2026-11-03T14:00:00Z', rating: 'Hold', narrative_complete: true },
  { report_id: 'r-aapl-1', run_id: 'run-a1', cik: 320193, ticker: 'AAPL', name: 'Apple Inc.', created_at: '2026-10-01T14:00:00Z', rating: 'Hold', narrative_complete: true }
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
  { prediction_id: 'p-aapl', cik: 320193, ticker: 'AAPL', run_at: '2026-08-01T14:00:00Z', rating: 'Buy', bear: 190, base: 250, bull: 290, grades: [] }
]

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

// ---------- the fake itself ----------

const listeners = {
  note: new Set<(n: EngineNotification) => void>(),
  menu: new Set<(c: MenuCommand) => void>(),
  flag: new Set<(p: { claimId: string }) => void>()
}

const listen = <T>(set: Set<(x: T) => void>) => (fn: (x: T) => void) => {
  set.add(fn)
  return () => {
    set.delete(fn)
  }
}

function makeBridge(): FakeBridge {
  return {
    runReport: vi.fn<TearsheetApi['runReport']>(async (query: string) => ok({ run_id: 'run-new', ticker: query.toUpperCase(), name: search(query)[0]?.name ?? null })),
    cancel: vi.fn<TearsheetApi['cancel']>(async () => ok({ ok: true })),
    resume: vi.fn<TearsheetApi['resume']>(async () => ok({ run_id: 'run-new', ticker: null, name: null })),
    getReport: vi.fn<TearsheetApi['getReport']>(async (reportId: string, opts?: { view?: string; side?: string }) => ok(report(reportId, opts))),
    listCompanies: vi.fn<TearsheetApi['listCompanies']>(async () => ok(COMPANIES)),
    searchCompanies: vi.fn<TearsheetApi['searchCompanies']>(async (query: string) => ok(search(query))),
    getChart: vi.fn<TearsheetApi['getChart']>(async () => ok(chart())),
    fetchHistory: vi.fn<TearsheetApi['fetchHistory']>(async () => ok({ first_date: '2021-11-08', days: 1260 })),
    checkKey: vi.fn<TearsheetApi['checkKey']>(async (service: 'massive' | 'fred') => ok({ proof: service === 'massive' ? 'Works: AAPL closed at $230.10 on Nov 6' : 'Works: inflation was 2.9% in September' })),
    runSafetyCheck: vi.fn<TearsheetApi['runSafetyCheck']>(async () => ok({ started: true })),
    openTerminal: vi.fn<TearsheetApi['openTerminal']>(async () => undefined),
    openExternal: vi.fn<TearsheetApi['openExternal']>(async () => true),
    find: vi.fn<TearsheetApi['find']>(async () => undefined),
    stopFind: vi.fn<TearsheetApi['stopFind']>(async () => undefined),
    onMenu: vi.fn<TearsheetApi['onMenu']>(listen(listeners.menu)),
    listReports: vi.fn<TearsheetApi['listReports']>(async () => ok(REPORTS)),
    listPredictions: vi.fn<TearsheetApi['listPredictions']>(async () => ok(PREDICTIONS)),
    flagClaim: vi.fn<TearsheetApi['flagClaim']>(async () => ok({ review_id: 'rv-1' })),
    rereadFiling: vi.fn<TearsheetApi['rereadFiling']>(async () => ok({ deleted: 3 })),
    getTools: vi.fn<TearsheetApi['getTools']>(async () => TOOLS),
    setKey: vi.fn<TearsheetApi['setKey']>(async () => ok({ ok: true })),
    getSettings: vi.fn<TearsheetApi['getSettings']>(async () => ok(settings())),
    setSetting: vi.fn<TearsheetApi['setSetting']>(async () => ok({ ok: true })),
    gradeDue: vi.fn<TearsheetApi['gradeDue']>(async () => ok({ graded: 0 })),
    onNotification: vi.fn<TearsheetApi['onNotification']>(listen(listeners.note)),
    onFlagRequested: vi.fn<TearsheetApi['onFlagRequested']>(listen(listeners.flag))
  }
}

export let bridge: FakeBridge = makeBridge()

// Before each test (setup.ts): a fresh fake on window.tearsheet, with no listeners.
export function installBridge(): FakeBridge {
  listeners.note.clear()
  listeners.menu.clear()
  listeners.flag.clear()
  bridge = makeBridge()
  Object.defineProperty(window, 'tearsheet', { configurable: true, value: bridge })
  return bridge
}

// The engine sends a note (progress, report_ready, safety_done, engine_restarted…).
export function emit(method: string, params: Record<string, unknown> = {}): void {
  act(() => {
    for (const fn of listeners.note) fn({ method, params })
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
