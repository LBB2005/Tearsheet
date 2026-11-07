// Pure logic for the report page's top bar (report/ReportBar.tsx). On the left: the ticker, the
// last close Tearsheet has and the day's move. On the right, in one box: the report's rating, its
// base case against that close, its 12-month range as a small line, and the peer score. When the
// toolbar runs out of room, parts drop out one at a time in the order of DROPS: the rating and
// the day's move in % go last, and the ticker and the price always stay.

import type { CompanyRow, PriceRange, ReportBar } from '../../shared/protocol'
import { shortDate } from '../nav'

export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const wholeDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export type Dir = 'up' | 'down' | 'flat'
export type Rating = NonNullable<ReportBar['rating']>

const RATINGS: readonly string[] = ['Buy', 'Hold', 'Sell']

// A sign that reads as a minus, not a hyphen.
const signed = (text: string, dir: Dir) => (dir === 'up' ? `+${text}` : dir === 'down' ? `−${text}` : text)

export interface Move {
  dollars: string
  percent: string
  dir: Dir
}

// The day's move from the close before: "+$3.41" and "+1.9%". Under half a cent is no move.
export function dayMove(close: number | null, previous: number | null): Move | null {
  if (close === null || previous === null || !(previous > 0)) return null
  const diff = close - previous
  const dir: Dir = Math.abs(diff) < 0.005 ? 'flat' : diff > 0 ? 'up' : 'down'
  const percent = (Math.abs(diff) / previous) * 100
  return { dollars: signed(money.format(Math.abs(diff)), dir), percent: signed(`${percent.toFixed(1)}%`, dir), dir }
}

// A price against the last close, in %: the base case is "+25.2%" above it.
export function gap(target: number, close: number): { text: string; dir: Dir } | null {
  if (!(close > 0)) return null
  const p = (target / close - 1) * 100
  const dir: Dir = Math.abs(p) < 0.05 ? 'flat' : p > 0 ? 'up' : 'down'
  return { text: signed(`${Math.abs(p).toFixed(1)}%`, dir), dir }
}

export function ordinal(k: number): string {
  const teen = k % 100
  if (teen >= 11 && teen <= 13) return `${k}th`
  return `${k}${{ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] ?? 'th'}`
}

// Where the range line puts its marks, from 0 (left) to 1 (right): the bear and bull ends, the
// base tick and the last close. A close outside the range widens the scale to take it in.
export function rangeMarks(range: PriceRange, close: number): { bear: number; base: number; bull: number; close: number } {
  const lo = Math.min(range.bear, close)
  const hi = Math.max(range.bull, close)
  const at = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)
  return { bear: at(range.bear), base: at(range.base), bull: at(range.bull), close: at(close) }
}

// ---------- what each part says when you point at it ----------

export function closeNote(bar: ReportBar): string {
  return bar.close_date ? `Close on ${shortDate(bar.close_date)}` : 'The last close Tearsheet has'
}

export function moveNote(bar: ReportBar): string {
  return bar.previous_close === null ? '' : `Change from the close before, ${money.format(bar.previous_close)}`
}

export function ratingNote(bar: ReportBar): string {
  if (bar.capped) {
    const flags = bar.red_flags.map((f) => f.toLowerCase()).join(', ')
    return flags ? `Capped at Hold by a red flag: ${flags}` : 'Capped at Hold by a red flag'
  }
  return 'Against its peer group over the next 12 months'
}

export function baseNote(range: PriceRange): string {
  return `Base case for the next 12 months, ${money.format(range.base)}, against the last close`
}

export function rangeNote(range: PriceRange): string {
  return `12-month range: bear ${money.format(range.bear)}, base ${money.format(range.base)}, bull ${money.format(range.bull)}. The dot is the last close.`
}

export function peersNote(bar: ReportBar): string {
  if (bar.percentile === null) return ''
  const group = bar.peers ? `its ${bar.peers} peers` : 'its peer group'
  return `Scores in the ${ordinal(bar.percentile)} percentile of ${group}`
}

// ---------- fitting the bar to the toolbar ----------

// What drops out first when the bar runs out of room, one step at a time: level k hides the
// first k of these. The last two only go when the chart and the find field leave next to no room.
export const DROPS = ['date', 'peers', 'range', 'dollars', 'capped', 'base', 'rating', 'move'] as const
export type Part = (typeof DROPS)[number]
export const LEVELS = DROPS.length + 1

export function shows(level: number, part: Part): boolean {
  return DROPS.indexOf(part) >= level
}

// The first level whose full width fits the room; the last level when none does.
export function fitLevel(widths: number[], room: number): number {
  const i = widths.findIndex((w) => Math.ceil(w) <= room)
  return i === -1 ? Math.max(0, widths.length - 1) : i
}

// ---------- the bar before the report has loaded, or without its numbers ----------

// The sidebar's row has the last close; the list of reports has the rating. The rest waits for
// the report.
export function listBar(row: CompanyRow | null | undefined, rating?: string | null): ReportBar {
  return {
    close: row?.price ?? null,
    close_date: row?.price_date ?? null,
    previous_close: null,
    rating: rating && RATINGS.includes(rating) ? (rating as Rating) : null,
    capped: false,
    red_flags: [],
    range: null,
    percentile: null,
    peers: null
  }
}
