// The prediction log's compare chart (docs/superpowers/specs/2026-11-08-prediction-log-page-design.md):
// the ticked companies' total return against the S&P 500. Pure: log/CompareChart.tsx draws it.
//
// 1M, 3M and 1Y start every line at 0% on the range's first day, with SPY as a grey dashed line.
// Since prediction draws each stock's lead over SPY from its own start day (stock return minus
// SPY's over the same days, the way grading compares them), so 0% means level with the S&P 500,
// and the x axis counts trading days since each prediction.

import type { PredictionPrices } from '../../shared/protocol'
import { niceTicks } from '../chart/series'

export type CompareRange = '1M' | '3M' | '1Y' | 'since'

export const COMPARE_RANGES: [key: CompareRange, label: string][] = [
  ['1M', '1M'],
  ['3M', '3M'],
  ['1Y', '1Y'],
  ['since', 'Since prediction']
]

const SPAN: Record<Exclude<CompareRange, 'since'>, number> = { '1M': 21, '3M': 63, '1Y': 252 }

// Line colours, by the order they were ticked: the app's colour names, never typed colours.
// No greys: the S&P 500's line is the pale one (C6 of the UI check, 10 Nov 2026).
export const LINE_COLOURS = ['var(--accent)', 'var(--hold)', 'var(--accent2)', 'var(--up)', 'var(--bad-text3)', 'var(--accent-lo)']

export interface Pick {
  cik: number
  ticker: string
  run_at: string
}

export interface CompareLine {
  key: string
  label: string
  colour: string
  spy: boolean
  values: (number | null)[]
  last: number | null
}

export interface CompareSeries {
  // One label per x position: a date, or "day N" since the predictions.
  xs: string[]
  lines: CompareLine[]
  // Why nothing is drawn, when nothing can be.
  empty: string | null
}

// How far back to ask for prices: a year and a little, or the earliest ticked prediction.
export function sinceFor(picks: Pick[], now: Date = new Date()): string {
  const yearAgo = new Date(now.getTime() - 380 * 86_400_000).toISOString().slice(0, 10)
  const earliest = picks.reduce<string | null>((a, p) => (a === null || p.run_at < a ? p.run_at : a), null)
  if (!earliest) return yearAgo
  const before = new Date(Date.parse(earliest) - 7 * 86_400_000).toISOString().slice(0, 10)
  return before < yearAgo ? before : yearAgo
}

// The first trading day whose close (4pm New York, taken as 21:00 UTC) comes after the prediction.
export function startIndex(dates: string[], runAt: string): number {
  const made = Date.parse(runAt)
  return dates.findIndex((d) => Date.parse(`${d}T21:00:00Z`) > made)
}

const rebased = (values: (number | null)[], from: number): (number | null)[] => {
  const start = values.slice(from).find((v) => v != null && v > 0)
  return values.slice(from).map((v) => (v == null || start == null ? null : v / start - 1))
}

const lastOf = (values: (number | null)[]) => {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i]
  return null
}

export function compareSeries(prices: PredictionPrices | null, picks: Pick[], range: CompareRange): CompareSeries {
  if (picks.length === 0) return { xs: [], lines: [], empty: 'Tick up to 6 predictions to compare them here.' }
  if (!prices || prices.dates.length < 2) return { xs: [], lines: [], empty: 'No prices are stored for these companies yet.' }
  const total = (cik: number) => prices.series.find((s) => s.cik === cik)?.total ?? prices.dates.map(() => null)
  if (range !== 'since') {
    const from = Math.max(0, prices.dates.length - 1 - SPAN[range])
    const lines: CompareLine[] = [{ key: 'spy', label: 'S&P 500', colour: 'var(--c-spy)', spy: true, values: rebased(prices.spy, from), last: null }].concat(
      picks.map((p, i) => ({ key: String(p.cik), label: p.ticker, colour: LINE_COLOURS[i % LINE_COLOURS.length], spy: false, values: rebased(total(p.cik), from), last: null }))
    )
    lines.forEach((l) => (l.last = lastOf(l.values)))
    return { xs: prices.dates.slice(from), lines, empty: null }
  }
  // Since each prediction: the lead over SPY, day by day from its own start.
  const leads = picks.map((p, i) => {
    const s = startIndex(prices.dates, p.run_at)
    if (s < 0) return null
    const stock = total(p.cik)
    const a = stock[s]
    const b = prices.spy[s]
    const values = prices.dates.slice(s).map((_, k) => {
      const v = stock[s + k]
      const w = prices.spy[s + k]
      return a == null || b == null || v == null || w == null || a <= 0 || b <= 0 ? null : v / a - w / b
    })
    return { key: String(p.cik), label: p.ticker, colour: LINE_COLOURS[i % LINE_COLOURS.length], spy: false, values, last: lastOf(values) }
  })
  const drawn = leads.filter((l): l is CompareLine => l !== null && l.values.length >= 2)
  if (drawn.length === 0) return { xs: [], lines: [], empty: 'No prices since the predictions yet. From the next close, each line shows its lead over the S&P 500 since its own prediction day.' }
  const days = Math.max(...drawn.map((l) => l.values.length))
  return { xs: Array.from({ length: days }, (_, k) => `day ${k}`), lines: drawn, empty: null }
}

export interface Plot {
  paths: { key: string; d: string; colour: string; spy: boolean }[]
  yTicks: { y: number; label: string; zero: boolean }[]
  xTicks: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[]
}

// Scales the series into a width × height box (SVG units).
export function plot(series: CompareSeries, width: number, height: number, label: (x: string) => string = (x) => x): Plot {
  const all = series.lines.flatMap((l) => l.values.filter((v): v is number => v != null))
  if (all.length === 0) return { paths: [], yTicks: [], xTicks: [] }
  let lo = Math.min(0, ...all)
  let hi = Math.max(0, ...all)
  const pad = (hi - lo) * 0.08 || 0.02
  lo -= pad
  hi += pad
  const n = series.xs.length
  const X = (i: number) => (n < 2 ? width : (i / (n - 1)) * width)
  const Y = (v: number) => height - ((v - lo) / (hi - lo)) * height
  const paths = series.lines.map((l) => {
    let d = ''
    l.values.forEach((v, i) => {
      if (v != null) d += `${d ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`
    })
    return { key: l.key, d, colour: l.colour, spy: l.spy }
  })
  const yTicks = niceTicks(lo, hi, 4).map((v) => ({ y: Y(v), label: v === 0 ? '0%' : `${v < 0 ? '−' : '+'}${Math.round(Math.abs(v) * 100)}%`, zero: Math.abs(v) < 1e-9 }))
  const xTicks = n < 2 ? [] : [0, 1, 2, 3].map((k) => {
    const i = Math.round((k * (n - 1)) / 3)
    return { x: X(i), label: label(series.xs[i]), anchor: (k === 0 ? 'start' : k === 3 ? 'end' : 'middle') as 'start' | 'middle' | 'end' }
  })
  return { paths, yTicks, xTicks }
}
