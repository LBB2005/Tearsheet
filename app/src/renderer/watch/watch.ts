// The Watchlist page's pure logic (pages/Watch.tsx draws it): which rows a list holds, the smart
// lists, the grouping under All watched, the "need a look" strip, the rows' range bars and the
// CSV. Every number comes from the engine (get_watchlist, engine watchlist.py); this only picks,
// orders and formats.

import type { WatchList, WatchPage, WatchReason, WatchRow } from '../../shared/protocol'
import { dayText } from '../nav'

// An engine sentence with its dates as the app writes them: "the 7 Nov 2026 report" reads "the
// Nov 7 report" (nav.ts dayText), so the strip and the panel match the rest of the window.
export function readable(text: string, now: Date = new Date()): string {
  return text.replace(/\b\d{1,2} [A-Z][a-z]{2} \d{4}\b/g, (d) => dayText(d, now))
}

// A list on the page: one of Liam's lists by id, or a smart list.
export type ListKey = number | 'all' | 'look' | 'norep'

export const SMART: [key: Exclude<ListKey, number>, label: string][] = [
  ['all', 'All watched'],
  ['look', 'Needs a look'],
  ['norep', 'No report yet']
]

export const isSmart = (key: ListKey): key is Exclude<ListKey, number> => typeof key !== 'number'

// The reasons that make a row worth a look now (the engine's WatchReason kinds), most urgent
// first. "No report yet" and a stale price are facts about the row, not news, so they don't
// count; the smart list No report yet has those.
const LOOK_KINDS: WatchReason['kind'][] = ['outside', 'trigger', 'near_trigger', 'moved', 'slot_open']

// Whether a row needs a look: an alert that fired and hasn't been seen, or a reason the engine
// gives now.
export function needsLook(row: WatchRow): boolean {
  return row.unseen > 0 || row.reasons.some((r) => LOOK_KINDS.includes(r.kind))
}

// The reason to show first for a row in the strip and on hover: the engine's most urgent one.
export function topReason(row: WatchRow): WatchReason | null {
  return row.reasons.find((r) => LOOK_KINDS.includes(r.kind)) ?? row.reasons[0] ?? null
}

// The rows a list holds: one of Liam's lists in its saved order (WatchList.ciks), or a smart list
// in the order companies were first added.
export function rowsOf(page: WatchPage, key: ListKey): WatchRow[] {
  if (key === 'all') return page.rows
  if (key === 'look') return page.rows.filter(needsLook)
  if (key === 'norep') return page.rows.filter((r) => !r.levels)
  const list = page.lists.find((l) => l.list_id === key)
  if (!list) return []
  const byCik = new Map(page.rows.map((r) => [r.cik, r]))
  return list.ciks.map((cik) => byCik.get(cik)).filter((r): r is WatchRow => r !== undefined)
}

export function listName(page: WatchPage, key: ListKey): string {
  if (isSmart(key)) return SMART.find(([k]) => k === key)?.[1] ?? 'Watchlist'
  return page.lists.find((l) => l.list_id === key)?.name ?? 'Watchlist'
}

// The list shown, kept to one that still exists: a deleted list falls back to All watched.
export function liveKey(page: WatchPage, key: ListKey): ListKey {
  return isSmart(key) || page.lists.some((l) => l.list_id === key) ? key : 'all'
}

export interface Group {
  // A list's id, or 'none' for companies in no list.
  id: number | 'none'
  name: string
  rows: WatchRow[]
}

// All watched, grouped by list in the lists' order, a company under every list it is in, then
// those in no list (left after a list was deleted, say).
export function groups(page: WatchPage): Group[] {
  const out: Group[] = page.lists.map((l) => ({ id: l.list_id, name: l.name, rows: rowsOf(page, l.list_id) }))
  const loose = page.rows.filter((r) => r.lists.length === 0)
  if (loose.length) out.push({ id: 'none', name: 'In no list', rows: loose })
  return out.filter((g) => g.rows.length > 0)
}

// The strip over the list: the rows that need a look, those with unseen alerts first, then by
// how urgent their first reason is.
export function attention(rows: WatchRow[]): { row: WatchRow; reason: WatchReason | null }[] {
  const rank = (r: WatchRow) => {
    const top = topReason(r)
    const k = top ? LOOK_KINDS.indexOf(top.kind) : LOOK_KINDS.length
    return (r.unseen > 0 ? 0 : 100) + (k < 0 ? LOOK_KINDS.length : k)
  }
  const seen = new Set<number>()
  return rows
    .filter(needsLook)
    .filter((r) => (seen.has(r.cik) ? false : (seen.add(r.cik), true)))
    .sort((a, b) => rank(a) - rank(b))
    .map((row) => ({ row, reason: topReason(row) }))
}

// The average move since the report over the rows that have one, or null.
export function averageSince(rows: WatchRow[]): number | null {
  const moves = rows.map((r) => r.since_report).filter((v): v is number => v !== null)
  return moves.length ? moves.reduce((s, v) => s + v, 0) / moves.length : null
}

// The rows "Queue reports" would send: no report yet, or a new report would be an official
// prediction (30 days on). The line itself decides at the end (plan_line, skip_recent).
export function toQueue(rows: WatchRow[]): WatchRow[] {
  const seen = new Set<number>()
  return rows.filter((r) => !seen.has(r.cik) && (seen.add(r.cik), r.queued === null && (!r.levels || r.slot_open)))
}

export interface BarSpot {
  // Percent across the bar, 0 to 100, on a log scale from just under the low (or the price) to
  // just over the high (or the price).
  bear: number
  base: number
  bull: number
  now: number
  then: number | null
}

// Where the low, base, high, the price now and the price at the report sit on a row's bar.
export function barSpot(row: WatchRow): BarSpot | null {
  const lv = row.levels
  if (!lv || lv.bear === null || lv.bull === null || lv.base === null || row.price === null || !(lv.bear > 0) || !(lv.bull > lv.bear)) return null
  const lo = Math.min(lv.bear, row.price) * 0.97
  const hi = Math.max(lv.bull, row.price) * 1.03
  const x = (p: number) => Math.max(0, Math.min(100, ((Math.log(p) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 100))
  const then = lv.report_price !== null && lv.report_price > 0 ? x(lv.report_price) : null
  return { bear: x(lv.bear), base: x(lv.base), bull: x(lv.bull), now: x(row.price), then }
}

// The rating-change price to show, if the report has one the price can reach: its price, which
// way the price has to go, and what the rating would turn to.
export function flipOf(row: WatchRow): { price: number; above: boolean; to: 'Buy' | 'Hold' | 'Sell' } | null {
  const lv = row.levels
  if (!lv || !lv.rating || row.price === null) return null
  const pick: { price: number; kind: 'buy' | 'sell' }[] = []
  if (lv.buy_reachable && lv.buy_trigger !== null) pick.push({ price: lv.buy_trigger, kind: 'buy' })
  if (lv.sell_reachable && lv.sell_trigger !== null) pick.push({ price: lv.sell_trigger, kind: 'sell' })
  if (!pick.length) return null
  const near = pick.sort((a, b) => Math.abs(a.price / row.price! - 1) - Math.abs(b.price / row.price! - 1))[0]
  const to = near.kind === 'buy' ? (lv.rating === 'Buy' ? 'Hold' : 'Buy') : lv.rating === 'Sell' ? 'Hold' : 'Sell'
  return { price: near.price, above: near.price > row.price, to }
}

// ---------- per-viewer choices, kept in this window's storage ----------

interface Store {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const local = (): Store | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const LIST_KEY = 'watch.list'
const PICK_KEY = 'watch.cik'

export function loadKey(store: Store | null = local()): ListKey {
  try {
    const raw = store?.getItem(LIST_KEY)
    if (raw === 'all' || raw === 'look' || raw === 'norep') return raw
    const n = Number(raw)
    return raw && Number.isInteger(n) && n > 0 ? n : 'all'
  } catch {
    return 'all'
  }
}

export function saveKey(key: ListKey, store: Store | null = local()): void {
  try {
    store?.setItem(LIST_KEY, String(key))
  } catch {
    // Storage refused: the choice lasts this visit only.
  }
}

export function loadPick(store: Store | null = local()): number | null {
  try {
    const n = Number(store?.getItem(PICK_KEY))
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function savePick(cik: number, store: Store | null = local()): void {
  try {
    store?.setItem(PICK_KEY, String(cik))
  } catch {
    // As above.
  }
}

// ---------- the CSV ----------

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v)
  // A leading = + - @ would run as a formula in a spreadsheet: a quote mark keeps it text.
  const safe = /^-?\d+(\.\d+)?$/.test(s) || !/^[=+\-@\t\r]/.test(s) ? s : `'${s}`
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const num = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? '' : v.toFixed(digits))

// One row per company in `rows`, with the lists it is in by name.
export function watchCsv(rows: WatchRow[], lists: WatchList[]): string {
  const names = new Map(lists.map((l) => [l.list_id, l.name]))
  const head = ['Ticker', 'Company', 'Lists', 'Price', 'Price date', 'Rating', 'Low', 'Base', 'High', 'Since report %', 'To base %', 'Report date', 'Note']
  const body = rows.map((r) =>
    [
      r.ticker,
      r.name,
      r.lists.map((id) => names.get(id) ?? '').filter(Boolean).join('; '),
      num(r.price),
      r.price_date ?? '',
      r.levels?.rating ?? '',
      num(r.levels?.bear),
      num(r.levels?.base),
      num(r.levels?.bull),
      r.since_report === null ? '' : (r.since_report * 100).toFixed(1),
      r.to_base === null ? '' : (r.to_base * 100).toFixed(1),
      r.levels?.report_date ?? '',
      r.note
    ]
      .map(cell)
      .join(',')
  )
  return [head.join(','), ...body].join('\n') + '\n'
}

export function watchCsvName(listLabel: string, now: Date = new Date()): string {
  const safe = listLabel.replace(/[^A-Za-z0-9 ]+/g, '').trim() || 'Watchlist'
  const day = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `Tearsheet ${safe} ${day}.csv`
}
