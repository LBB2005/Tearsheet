// The sidebar's list of reports: what the search, the sort and the filters leave, and how it is
// grouped. Pinned companies come first. Newest first groups the rest by the day of the report,
// in local time (Today, Yesterday, Previous 7 days, Previous 30 days, Older); Rating groups
// them by Buy, Hold and Sell; A to Z and Biggest move are one list. The sort and the filters
// are kept between launches (localStorage, sidebar.list); the search is not.

import type { CompanyRow } from '../../shared/protocol'

export type SortKey = 'newest' | 'az' | 'rating' | 'move'
export const RATINGS = ['Buy', 'Hold', 'Sell'] as const
export type Rating = (typeof RATINGS)[number]

export interface ListPrefs {
  sort: SortKey
  // Ratings left out; none means every rating, and reports with no rating, are shown.
  hideRatings: Rating[]
  officialOnly: boolean
  sector: string | null
  // The Hidden group, with the reports hidden from the list (deleted official predictions).
  showHidden: boolean
}

export const DEFAULT_PREFS: ListPrefs = { sort: 'newest', hideRatings: [], officialOnly: false, sector: null, showHidden: false }

export const SORT_NAMES: Record<SortKey, string> = {
  newest: 'Newest first',
  az: 'A to Z',
  rating: 'Rating, Buy first',
  move: 'Biggest move since the report'
}

export interface Group {
  key: string
  // None for a list with no headings.
  label: string | null
  rows: CompanyRow[]
}

// A ticker that starts with the search, or a name with a word that does ("micro" finds
// Advanced Micro Devices and Micron).
export function matches(row: { ticker: string | null; name: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if ((row.ticker ?? '').toLowerCase().startsWith(q)) return true
  const name = (row.name ?? '').toLowerCase()
  return name.startsWith(q) || name.split(/[\s.,&/-]+/).some((word) => word.startsWith(q))
}

export function filtersOn(prefs: ListPrefs): number {
  return (prefs.hideRatings.length > 0 ? 1 : 0) + (prefs.officialOnly ? 1 : 0) + (prefs.sector ? 1 : 0)
}

export function kept(row: CompanyRow, prefs: ListPrefs, query: string): boolean {
  if (!matches(row, query)) return false
  if (prefs.hideRatings.length > 0 && (row.rating === null || prefs.hideRatings.includes(row.rating as Rating))) return false
  if (prefs.officialOnly && !row.official) return false
  if (prefs.sector && row.sector !== prefs.sector) return false
  return true
}

const newest = (a: CompanyRow, b: CompanyRow) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)
// A move's size, either way; a report with no move comes last.
const size = (move: number | null) => (move === null ? -1 : Math.abs(move))
const rank = (rating: string | null) => {
  const i = RATINGS.indexOf(rating as Rating)
  return i < 0 ? RATINGS.length : i
}

export function sortRows(rows: CompanyRow[], sort: SortKey): CompanyRow[] {
  const out = [...rows]
  if (sort === 'az') out.sort((a, b) => a.ticker.localeCompare(b.ticker))
  else if (sort === 'rating') out.sort((a, b) => rank(a.rating) - rank(b.rating) || newest(a, b))
  else if (sort === 'move') out.sort((a, b) => size(b.since_report) - size(a.since_report) || newest(a, b))
  else out.sort(newest)
  return out
}

const DAY_MS = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

// The date group of a report made at `iso`, by local calendar days.
export function dateGroup(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'Older'
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'Previous 7 days'
  if (days < 30) return 'Previous 30 days'
  return 'Older'
}

export function groupRows(rows: CompanyRow[], prefs: ListPrefs, query: string, now: Date = new Date()): Group[] {
  const sorted = sortRows(
    rows.filter((r) => kept(r, prefs, query)),
    prefs.sort
  )
  const pinned = sorted.filter((r) => r.pinned)
  const rest = sorted.filter((r) => !r.pinned)
  const groups: Group[] = pinned.length > 0 ? [{ key: 'pinned', label: 'Pinned', rows: pinned }] : []
  const add = (key: string, label: string | null, row: CompanyRow) => {
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else groups.push({ key, label, rows: [row] })
  }
  for (const row of rest) {
    if (prefs.sort === 'newest') {
      const label = dateGroup(row.created_at, now)
      add(label, label, row)
    } else if (prefs.sort === 'rating') {
      const label = row.rating && RATINGS.includes(row.rating as Rating) ? row.rating : 'No rating'
      add(label, label, row)
    } else add('all', pinned.length > 0 ? 'Others' : null, row)
  }
  return groups
}

// The sectors to filter by: those of the companies listed, A to Z.
export function sectorsOf(rows: CompanyRow[]): string[] {
  return [...new Set(rows.map((r) => r.sector).filter((s): s is string => Boolean(s)))].sort()
}

// ⇧-click: every key from the anchor to the one clicked, in the list's order.
export function selectRange<T>(order: T[], anchor: T | null, target: T): T[] {
  const to = order.indexOf(target)
  const from = anchor === null ? -1 : order.indexOf(anchor)
  if (to < 0) return []
  if (from < 0) return [target]
  return order.slice(Math.min(from, to), Math.max(from, to) + 1)
}

// "+1.2%" / "−3.0%" for the move since the report.
export function moveText(move: number | null): string | null {
  if (move === null) return null
  const pct = (Math.round(Math.abs(move) * 1000) / 10).toFixed(1)
  if (pct === '0.0') return '0.0%'
  return `${move > 0 ? '+' : '−'}${pct}%`
}

// What the notice says after a delete. `hidden` reports were all asked for; `erasable` are the
// ones that go for good once the undo has passed; the others are official or reviewed.
export function deleteNotice(rows: Pick<CompanyRow, 'ticker'>[], hidden: number, erasable: number): { title: string; text?: string } {
  const kept = hidden - erasable
  const who = rows.length === 1 ? rows[0].ticker : null
  const reports = (n: number) => (n === 1 ? 'report' : `${n} reports`)
  if (kept === 0) {
    return { title: who ? (hidden === 1 ? `Deleted the ${who} report` : `Deleted ${who}’s ${hidden} reports`) : `Deleted ${hidden} reports` }
  }
  const text = 'An official prediction’s report is only hidden: it stays in the Prediction log. Hidden reports are in the sort and filter menu.'
  if (erasable === 0) {
    return { title: who ? (hidden === 1 ? `Hid the ${who} report` : `Hid ${who}’s ${hidden} reports`) : `Hid ${hidden} reports`, text }
  }
  return { title: `Deleted ${erasable === 1 ? 'a report' : reports(erasable)} and hid ${kept === 1 ? 'one' : kept}`, text }
}

// --- kept between launches ---------------------------------------------------------------------

type Store = Pick<Storage, 'getItem' | 'setItem'>
const KEY = 'sidebar.list'

const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadPrefs(store: Store | null = local()): ListPrefs {
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? 'null') as Partial<ListPrefs> | null
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS
    return {
      sort: raw.sort && raw.sort in SORT_NAMES ? raw.sort : 'newest',
      hideRatings: Array.isArray(raw.hideRatings) ? raw.hideRatings.filter((r): r is Rating => (RATINGS as readonly string[]).includes(r)) : [],
      officialOnly: raw.officialOnly === true,
      sector: typeof raw.sector === 'string' && raw.sector ? raw.sector : null,
      showHidden: raw.showHidden === true
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: ListPrefs, store: Store | null = local()): void {
  try {
    store?.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Not kept; the defaults apply next time.
  }
}
