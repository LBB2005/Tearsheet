// The price chart's data (the spec's "The chart → Ranges"): which stretch of the stored daily
// series each range shows, the compare lines started from 100, whether 5Y and All need the
// company's full history downloaded first, and the axis steps. Pure, so the chart and the tests
// share it.

import type { ChartSeries } from '../../shared/protocol'

export type Range = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'All'

// Trading days in each fixed range. YTD runs from 1 January of the last date's year, and All is
// everything stored.
export const RANGES = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '5Y': 1260 } as const

export const RANGE_ORDER: Range[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All']

// 5Y counts as stored when the history reaches back to within a month of five years, since the
// price plan serves five years back from the day it is asked, not from the last close.
const FIVE_YEAR_SLACK_DAYS = 31

const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1]

// Where the range starts in the stored series.
function startIndex(series: ChartSeries, range: Range): number {
  const n = series.dates.length
  if (range === 'All' || n === 0) return 0
  if (range === 'YTD') {
    const jan = `${(last(series.dates) as string).slice(0, 4)}-01-01`
    return Math.max(0, series.dates.findIndex((d) => d >= jan))
  }
  return Math.max(0, n - RANGES[range])
}

export function slice(series: ChartSeries, range: Range): ChartSeries {
  const s = startIndex(series, range)
  const dates = series.dates.slice(s)
  const from = dates[0]
  const to = last(dates)
  return {
    ...series,
    dates,
    close: series.close.slice(s),
    volume: series.volume.slice(s),
    peers: series.peers.slice(s),
    spy: series.spy.slice(s),
    filings: from && to ? series.filings.filter((f) => f.date >= from && f.date <= to) : []
  }
}

// A line started from 100 at its first value. Days before the line has a value stay empty.
export function rebase(values: (number | null)[]): (number | null)[] {
  const base = values.find((v): v is number => v !== null)
  if (base === undefined || base === 0) return values.map(() => null)
  return values.map((v) => (v === null ? null : (v / base) * 100))
}

function shiftDays(iso: string, years: number, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y + years, m - 1, d + days)).toISOString().slice(0, 10)
}

// 5Y and All need the company's full price history when what is stored starts later than five
// years before the last close. All asks for the same five years, which is what the plan serves.
export function needsHistory(series: ChartSeries, range: Range): boolean {
  if (range !== '5Y' && range !== 'All') return false
  const end = last(series.dates)
  const first = series.first_date || series.dates[0]
  if (!end || !first) return true
  return first > shiftDays(end, -5, FIVE_YEAR_SLACK_DAYS)
}

// Whether the stored history fills the range, so the readout can name it ("over 1 year") or
// say honestly where the stored history starts.
export function covers(series: ChartSeries, range: Range): boolean {
  if (range === 'All') return true
  if (range === 'YTD') {
    const end = last(series.dates)
    // Stored from the year's first week, so YTD starts at its first trading day.
    return !!end && !!series.dates[0] && series.dates[0] <= `${end.slice(0, 4)}-01-07`
  }
  if (range === '5Y') return !needsHistory(series, '5Y')
  return series.dates.length >= RANGES[range]
}

// About how many years are stored: "1.2 years", "5 years", "1 year".
export function yearsServed(series: ChartSeries): string {
  const first = series.first_date || series.dates[0]
  const end = last(series.dates)
  if (!first || !end) return '0 years'
  const years = (Date.parse(end) - Date.parse(first)) / (365.25 * 86_400_000)
  const shown = years < 2 ? Math.round(years * 10) / 10 : Math.round(years)
  return `${shown} ${shown === 1 ? 'year' : 'years'}`
}

// Round axis steps (1, 2, 2.5 or 5 times a power of ten) from min to max.
export function niceTicks(min: number, max: number, n = 5): number[] {
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return Number.isFinite(min) ? [min] : []
  const raw = (max - min) / n
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p
  const out: number[] = []
  const first = Math.ceil(min / step - 1e-9)
  for (let k = first; k * step <= max + step * 1e-9; k++) out.push(Number((k * step).toFixed(10)))
  return out
}

// The change between two prices, and as a percentage of the first.
export function measure(a: number, b: number): { change: number; pct: number } {
  const change = b - a
  return { change, pct: a === 0 ? 0 : (change * 100) / a }
}

// "182 million", "12.3 million", "845,000".
export function volumeText(v: number): string {
  if (v >= 1e6) {
    const m = v / 1e6
    return `${m >= 100 ? Math.round(m) : Math.round(m * 10) / 10} million`
  }
  return Math.round(v).toLocaleString('en-US')
}
