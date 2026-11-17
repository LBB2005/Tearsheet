// Dig deeper's page logic (pages/Dig.tsx): when to fetch today's numbers again, what each part's
// state line says, and how its numbers read. The engine works out every number (engine dig/);
// this only words and places them.

import type { DigPage, DigSector, DigSnapshot, DigTone, DigTradeSide, WatchLevels } from '../../shared/protocol'

// A part's state: fresh, carried from an earlier snapshot, not available, or failed.
export type PartState = DigSector['state']
import { shortDate } from '../nav'

// A snapshot older than this is fetched again when the page opens.
export const STALE_HOURS = 6

export function needsRefresh(page: DigPage, now: Date = new Date()): boolean {
  if (!page.has_report) return false
  if (!page.snapshot) return true
  return now.getTime() - new Date(page.snapshot.created_at).getTime() > STALE_HOURS * 3600_000
}

// The line under a part's heading: nothing when it is fresh; its date when it was carried from an
// earlier snapshot; the engine's reason when it is off or down.
export function partNote(part: { state: PartState; note: string | null; as_of: string | null }, source: string, now: Date = new Date()): string | null {
  if (part.state === 'ok') return null
  if (part.state === 'stale') return `From ${part.as_of ? shortDate(part.as_of, now) : 'an earlier look'}: ${source} didn’t answer this time.`
  return part.note ?? `${source} didn’t answer.`
}

export function asOfLine(s: DigSnapshot, now: Date = new Date()): string {
  const close = s.close_date ? `Prices to the close of ${shortDate(s.close_date, now)}. ` : ''
  return `${close}Gathered ${shortDate(s.created_at, now)}.`
}

export const subtitle = (page: DigPage): string => page.name

export interface RangeSpots {
  // Percent across the bar, 0 to 100, on a log scale a little past the low, the high and the close.
  bear: number
  base: number
  bull: number
  now: number
  then: number | null
  // The rating-change prices the price can reach.
  buy: number | null
  sell: number | null
}

export function rangeSpots(lv: WatchLevels, close: number): RangeSpots | null {
  if (lv.bear === null || lv.base === null || lv.bull === null || !(lv.bear > 0) || !(lv.bull > lv.bear) || !(close > 0)) return null
  const buy = lv.buy_reachable && lv.buy_trigger !== null && lv.buy_trigger > 0 ? lv.buy_trigger : null
  const sell = lv.sell_reachable && lv.sell_trigger !== null && lv.sell_trigger > 0 ? lv.sell_trigger : null
  const all = [lv.bear, lv.bull, close, ...(buy ? [buy] : []), ...(sell ? [sell] : [])]
  const lo = Math.log(Math.min(...all) * 0.96)
  const hi = Math.log(Math.max(...all) * 1.04)
  const x = (p: number) => ((Math.log(p) - lo) / (hi - lo)) * 100
  return {
    bear: x(lv.bear),
    base: x(lv.base),
    bull: x(lv.bull),
    now: x(close),
    then: lv.report_price !== null && lv.report_price > 0 ? x(lv.report_price) : null,
    buy: buy === null ? null : x(buy),
    sell: sell === null ? null : x(sell)
  }
}

// The report's key numbers as the report writes them: two are multiples, the rest ratios.
const MULTIPLES = new Set(['interest_coverage', 'operating_cash_flow_to_net_income'])
export function metricText(key: string, v: number | null): string {
  if (v === null) return '—'
  const text = MULTIPLES.has(key) ? `${Math.abs(v).toFixed(1)}×` : `${Math.abs(v * 100).toFixed(1)}%`
  return v < 0 ? `−${text}` : text
}

// How many peers and articles show before Show all.
export const FIRST_ROWS = 12

export const plainPct = (v: number | null, digits = 1): string => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`)

export function compact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `$${Math.round(v / 1e3)}K`
  return `$${Math.round(v)}`
}

export function toneLine(t: DigTone): string {
  const parts = [
    [t.positive, 'positive'],
    [t.neutral, 'neutral'],
    [t.negative, 'negative'],
    [t.unknown, 'with no tone']
  ].filter(([n]) => (n as number) > 0)
  return parts.length ? parts.map(([n, w]) => `${n} ${w}`).join(', ') : 'No articles'
}

const shares = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
export function tradeLine(side: DigTradeSide | null): string {
  if (!side) return '—'
  if (!side.trades) return 'None'
  const who = `${side.trades} trade${side.trades === 1 ? '' : 's'} by ${side.people} ${side.people === 1 ? 'person' : 'people'}`
  return `${who}: ${shares.format(side.shares)} shares${side.value > 0 ? `, ${compact(side.value)}` : ''}`
}
