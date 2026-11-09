import { describe, expect, it } from 'vitest'

import type { PredictionPrices } from '../../shared/protocol'
import { compareSeries, plot, sinceFor, startIndex } from './compare'

const DATES = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10']
const prices: PredictionPrices = {
  dates: DATES,
  spy: [100, 101, 102, 103, 104, 105, 106],
  series: [
    { cik: 1, total: [100, 110, 120, 130, 140, 150, 160] },
    { cik: 2, total: [null, null, 50, 50, 55, 60, 66] }
  ]
}
const A = { cik: 1, ticker: 'AAA', run_at: '2026-11-07T06:00:00+00:00' }
const B = { cik: 2, ticker: 'BBB', run_at: '2026-11-09T22:00:00+00:00' }

describe('the compare chart', () => {
  it('asks for a year of prices, or back to the earliest ticked prediction', () => {
    const now = new Date('2026-11-08T12:00:00Z')
    expect(sinceFor([], now)).toBe('2025-10-24')
    expect(sinceFor([{ ...A, run_at: '2025-06-01T00:00:00Z' }], now)).toBe('2025-05-25')
  })

  it('starts on the first close after the prediction', () => {
    expect(startIndex(DATES, A.run_at)).toBe(5)
    expect(startIndex(DATES, '2026-11-06T15:00:00+00:00')).toBe(4)
    expect(startIndex(DATES, '2026-11-10T22:00:00+00:00')).toBe(-1)
  })

  it('starts every line at 0% on the range’s first day, the S&P 500 first', () => {
    const s = compareSeries(prices, [A, B], '1Y')
    expect(s.empty).toBeNull()
    expect(s.xs).toEqual(DATES)
    expect(s.lines.map((l) => [l.label, l.spy])).toEqual([
      ['S&P 500', true],
      ['AAA', false],
      ['BBB', false]
    ])
    expect(s.lines[1].values[0]).toBe(0)
    expect(s.lines[1].last).toBeCloseTo(0.6, 9)
    // A company with no close yet on the first day starts at its own first close.
    expect(s.lines[2].values.slice(0, 3)).toEqual([null, null, 0])
    expect(s.lines[2].last).toBeCloseTo(0.32, 9)
  })

  it('since the prediction, draws each stock’s lead over the S&P 500 from its own day', () => {
    const s = compareSeries(prices, [A, B], 'since')
    // B has no close after its prediction yet, so only A is drawn.
    expect(s.lines.map((l) => l.label)).toEqual(['AAA'])
    expect(s.xs).toEqual(['day 0', 'day 1'])
    expect(s.lines[0].values[0]).toBe(0)
    expect(s.lines[0].values[1]).toBeCloseTo(160 / 150 - 106 / 105, 9)
  })

  it('says why nothing is drawn', () => {
    expect(compareSeries(prices, [], '1M').empty).toMatch(/Tick up to 6/)
    expect(compareSeries(null, [A], '1M').empty).toMatch(/No prices are stored/)
    expect(compareSeries(prices, [B], 'since').empty).toMatch(/No prices since the predictions yet/)
  })

  it('plots into a box with a 0% line and four date labels', () => {
    const out = plot(compareSeries(prices, [A], '1Y'), 700, 200)
    expect(out.paths).toHaveLength(2)
    expect(out.paths[1].d.startsWith('M0.0 ')).toBe(true)
    expect(out.yTicks.some((t) => t.zero && t.label === '0%')).toBe(true)
    expect(out.xTicks.map((t) => t.label)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-10'])
    expect(plot({ xs: [], lines: [], empty: 'x' }, 10, 10)).toEqual({ paths: [], yTicks: [], xTicks: [] })
  })
})
