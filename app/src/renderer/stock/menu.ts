// A stock's right-click menu: the one set of options for a company wherever it shows (the sidebar,
// the prediction log, the watchlist, the home page, the report line, the look-up box and the
// report's top bar). Each option is an action the app already has: open the report, dig deeper
// into the stock (pages/Dig.tsx), refresh it
// or write the first one (through the Refresh confirm, then the line), add to or take out of a
// watchlist, compare it (on a page with a compare chart), show it in the prediction log, copy the
// ticker, and open its filings on SEC EDGAR. An option that doesn't apply is greyed with a short
// reason. A plain function from what the app knows about the company to the menu's entries, so it
// is tested on its own; StockMenu.tsx draws it.

import type { CompanyRow, LineState, WatchList, WatchRow } from '../../shared/protocol'
import type { MenuEntry } from '../shell/Menu'

// The company, as the surface knows it. `reportId`: the report this row stands for (a prediction's
// report, a hidden report); left out, the company's latest report is used. `reportDate`: when the
// surface's report was written, for a company the sidebar doesn't list.
export interface Stock {
  ticker: string
  cik?: number | null
  name?: string | null
  reportId?: string | null
  reportDate?: string | null
}

// A watchlist, and whether the company is on it.
export interface StockList {
  list_id: number
  name: string
  on: boolean
}

// What the app knows about the company when the menu opens.
export interface StockFacts {
  // The report Open report opens, if there is one.
  reportId: string | null
  // When its latest report was written; null when it has none (Write a report…).
  latest: string | null
  // Its latest report is an official prediction (the log has it).
  official: boolean
  // In the report line: being written now, or waiting its turn.
  line: 'writing' | 'waiting' | null
  // The watchlists, or null while they load.
  lists: StockList[] | null
}

export interface StockActions {
  open: (reportId: string) => void
  // Dig deeper: the stock's research page, today's picture beside its report.
  dig: () => void
  write: () => void
  // `listId` null: the first list, made if there is none.
  watch: (listId: number | null) => void
  unwatch: (list: StockList) => void
  log: () => void
  copy: () => void
  edgar: () => void
}

// What only some surfaces have.
export interface StockExtras {
  // The page's compare chart (the prediction log, the watchlist): ticked or not, and why not.
  compare?: { on: boolean; toggle: () => void; why?: string }
  // The surface is this company's open report or its Dig deeper page, or the prediction log.
  here?: 'report' | 'log' | 'dig'
  // The surface's own options, after the shared ones (the sidebar's Pin, Select and Delete).
  more?: MenuEntry[]
}

const item = (label: string, onSelect: () => void, note?: string): MenuEntry => (note ? { kind: 'item', label, onSelect, disabled: true, note } : { kind: 'item', label, onSelect })
const nothing = () => undefined

export function stockEntries(stock: Stock, facts: StockFacts, act: StockActions, extras: StockExtras = {}): MenuEntry[] {
  const entries: MenuEntry[] = []
  const report = facts.reportId

  // The report: open it, or write one.
  if (extras.here === 'report') entries.push(item('Open report', nothing, 'Open now'))
  else entries.push(report ? item('Open report', () => act.open(report)) : item('Open report', nothing, 'No report yet'))
  if (extras.here === 'dig') entries.push(item('Dig deeper', nothing, 'Open now'))
  else entries.push(report ? item('Dig deeper', act.dig) : item('Dig deeper', nothing, 'No report yet'))
  const writeLabel = facts.latest || report ? 'Refresh report…' : 'Write a report…'
  if (facts.line === 'writing') entries.push(item(writeLabel, nothing, 'Being written now'))
  else if (facts.line === 'waiting') entries.push(item(writeLabel, nothing, 'In the line'))
  else entries.push(item(writeLabel, act.write))

  // The watchlist: one list (or none yet) is one item; several, a tick for each.
  entries.push({ kind: 'separator' })
  const lists = facts.lists
  if (lists === null) entries.push(item('Add to watchlist', nothing, 'Checking…'))
  else if (lists.length <= 1) {
    const only = lists[0]
    if (only?.on) entries.push(item('Remove from watchlist', () => act.unwatch(only)))
    else entries.push(item('Add to watchlist', () => act.watch(only?.list_id ?? null)))
  } else {
    entries.push({ kind: 'heading', label: 'Watchlists' })
    for (const l of lists) entries.push({ kind: 'check', label: l.name, checked: l.on, onSelect: () => (l.on ? act.unwatch(l) : act.watch(l.list_id)) })
  }

  // The page's own compare chart, and the log.
  const compare = extras.compare
  const showLog = facts.official && extras.here !== 'log'
  if (compare || showLog) entries.push({ kind: 'separator' })
  if (compare) entries.push(compare.on ? item('Stop comparing', compare.toggle) : item('Compare', compare.toggle, compare.why))
  if (showLog) entries.push(item('Show in Prediction log', act.log))

  entries.push({ kind: 'separator' })
  entries.push(item('Copy ticker', act.copy))
  entries.push(item('Open on SEC EDGAR', act.edgar))

  if (extras.more?.length) entries.push({ kind: 'separator' }, ...extras.more)
  return entries
}

// The company's EDGAR page: by its CIK, or by the ticker when the surface doesn't know the CIK
// (EDGAR takes either).
export function edgarUrl(stock: Pick<Stock, 'ticker' | 'cik'>): string {
  const id = stock.cik ? String(stock.cik) : encodeURIComponent(stock.ticker)
  return `https://www.sec.gov/edgar/browse/?CIK=${id}`
}

// The watchlists as the menu needs them: each list's companies, and each watched company's lists.
export type Watched = { lists: WatchList[]; rows: Pick<WatchRow, 'cik' | 'ticker' | 'lists'>[] }

// The company's facts from the app's lists: the sidebar's companies, the line and the watchlists
// (null while they load). Its CIK, when only another list knows it, for EDGAR and Remove.
export function stockFacts(stock: Stock, companies: CompanyRow[], line: LineState | null, watched: Watched | null): StockFacts & { cik: number | null } {
  const company = companies.find((c) => stock.cik != null && c.cik === stock.cik) ?? companies.find((c) => c.ticker === stock.ticker)
  const row = watched?.rows.find((r) => (stock.cik != null && r.cik === stock.cik) || r.ticker === stock.ticker)
  const cik = stock.cik ?? company?.cik ?? row?.cik ?? null
  const inLine = line?.writing?.ticker === stock.ticker ? 'writing' : line?.waiting.some((w) => w.ticker === stock.ticker) ? 'waiting' : null
  const lists: StockList[] | null = watched
    ? watched.lists.map((l) => ({ list_id: l.list_id, name: l.name, on: (cik !== null && l.ciks.includes(cik)) || (row?.lists.includes(l.list_id) ?? false) }))
    : null
  return {
    reportId: stock.reportId !== undefined ? stock.reportId : (company?.report_id ?? null),
    latest: company?.created_at ?? stock.reportDate ?? null,
    official: company?.official ?? false,
    line: inLine,
    lists,
    cik
  }
}
