import { describe, expect, it } from 'vitest'

import type { ChartSeries } from '../../shared/protocol'
import { covers, measure, namedFilings, needsHistory, niceTicks, RANGES, rangeLabel, rebase, slice, volumeText, yearsServed } from './series'

// Weekday closes from `start` to `end`, skipping New Year's Day as the market does.
function series(start: string, end: string): ChartSeries {
  const dates: string[] = []
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !iso.endsWith('-01-01')) dates.push(iso)
  }
  return {
    dates,
    close: dates.map((_, i) => 150 + i / 4),
    volume: dates.map((_, i) => 1e8 + i),
    total: dates.map((_, i) => 100 + i / 3),
    peers: dates.map((_, i) => (i < 3 ? null : 100 + i / 10)),
    spy: dates.map((_, i) => 100 + i / 20),
    filings: [
      { date: '2025-11-19', form: '10-Q' },
      { date: '2026-02-25', form: '10-K' },
      { date: '2026-10-29', form: '8-K' }
    ],
    trigger: 160,
    range: { bear: 130, base: 236, bull: 420 },
    first_date: dates[0]
  }
}

// Fourteen months stored, as a report run leaves it.
const STORED = series('2025-09-05', '2026-11-04')

describe('slice', () => {
  it('gives the last five days for 1W', () => {
    const week = slice(STORED, '1W')
    expect(week.dates).toHaveLength(5)
    expect(week.close).toHaveLength(5)
    expect(week.volume).toHaveLength(5)
    expect(week.total).toEqual(STORED.total.slice(-5))
    expect(week.dates[4]).toBe('2026-11-04')
  })

  it('starts YTD at the first date in January of the last date’s year', () => {
    const ytd = slice(STORED, 'YTD')
    expect(ytd.dates[0]).toBe(STORED.dates.find((d) => d.startsWith('2026-01')))
    expect(ytd.dates[0]).toBe('2026-01-02')
  })

  it('takes each range’s trading days, or all there is', () => {
    expect(slice(STORED, '1Y').dates).toHaveLength(RANGES['1Y'])
    expect(slice(STORED, '5Y').dates).toHaveLength(STORED.dates.length)
    expect(slice(STORED, 'All').dates).toEqual(STORED.dates)
  })

  it('keeps only the filings inside the range', () => {
    expect(slice(STORED, '3M').filings.map((f) => f.form)).toEqual(['8-K'])
    expect(slice(STORED, 'All').filings).toHaveLength(3)
  })
})

describe('rebase', () => {
  it('starts the line at 100 from its first value', () => {
    expect(rebase([null, 50, 75])).toEqual([null, 100, 150])
  })

  it('leaves a line with no values empty', () => {
    expect(rebase([null, null])).toEqual([null, null])
    expect(rebase([0, 5])).toEqual([null, null])
  })
})

describe('needsHistory', () => {
  it('is true for 5Y and All when fourteen months are stored', () => {
    expect(needsHistory(STORED, '5Y')).toBe(true)
    expect(needsHistory(STORED, 'All')).toBe(true)
  })

  it('is false for the ranges the stored months cover', () => {
    expect(needsHistory(STORED, '1Y')).toBe(false)
    expect(needsHistory(STORED, 'YTD')).toBe(false)
  })

  it('is false once five years are stored, to within a month', () => {
    expect(needsHistory(series('2021-11-04', '2026-11-04'), '5Y')).toBe(false)
    expect(needsHistory(series('2021-11-29', '2026-11-04'), 'All')).toBe(false)
    expect(needsHistory(series('2022-01-10', '2026-11-04'), '5Y')).toBe(true)
  })
})

describe('niceTicks', () => {
  it('gives round steps across the range', () => {
    expect(niceTicks(180, 230)).toEqual([180, 190, 200, 210, 220, 230])
  })

  it('handles small and flat ranges', () => {
    expect(niceTicks(0.1, 0.3, 4)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3])
    expect(niceTicks(0.1, 0.32, 4)).toEqual([0.1, 0.2, 0.3])
    expect(niceTicks(5, 5)).toEqual([5])
  })
})

describe('measure', () => {
  it('gives the change and the percentage between two prices', () => {
    expect(measure(200, 230)).toEqual({ change: 30, pct: 15 })
    expect(measure(200, 150)).toEqual({ change: -50, pct: -25 })
  })
})

describe('covers, yearsServed and volumeText', () => {
  it('tells whether the stored history fills a range', () => {
    expect(covers(STORED, '1Y')).toBe(true)
    expect(covers(STORED, '5Y')).toBe(false)
    expect(covers(STORED, 'YTD')).toBe(true)
    expect(covers(series('2026-03-02', '2026-11-04'), 'YTD')).toBe(false)
  })

  it('says how many years are stored', () => {
    expect(yearsServed(STORED)).toBe('1.2 years')
    expect(yearsServed(series('2021-11-04', '2026-11-04'))).toBe('5 years')
    expect(yearsServed(series('2025-11-04', '2026-11-04'))).toBe('1 year')
  })

  it('writes volume in plain words', () => {
    expect(volumeText(182_345_000)).toBe('182 million')
    expect(volumeText(12_340_000)).toBe('12.3 million')
    expect(volumeText(845_000)).toBe('845,000')
  })
})

describe('namedFilings', () => {
  it('names the 10-Ks and 10-Qs, never an 8-K, at least 36 px apart', () => {
    const marks = [
      { x: 100, form: '10-Q' },
      { x: 120, form: '10-K' },
      { x: 140, form: '8-K' },
      { x: 150, form: '10-K' },
      { x: null, form: '10-K' }
    ]
    expect(namedFilings(marks)).toEqual([true, false, false, true, false])
  })

  it('keeps every name clear of the fan’s heading', () => {
    // A name is about 28 px wide, centred on its line; the heading starts at `stop`.
    expect(namedFilings([{ x: 300, form: '10-Q' }, { x: 380, form: '10-K' }], 390)).toEqual([true, false])
    expect(namedFilings([{ x: 380, form: '10-K' }], 394)).toEqual([true])
  })
})

describe('rangeLabel', () => {
  it('names a 12-month target by its price and its move from today', () => {
    expect(rangeLabel(593.78, 344.04)).toEqual({ price: '$594', move: '+73%' })
    expect(rangeLabel(358.1, 344.04)).toEqual({ price: '$358', move: '+4%' })
    expect(rangeLabel(216.34, 344.04)).toEqual({ price: '$216', move: '−37%' })
    expect(rangeLabel(1250, 1000)).toEqual({ price: '$1,250', move: '+25%' })
  })
})
