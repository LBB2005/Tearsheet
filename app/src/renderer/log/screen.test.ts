import { describe, expect, it } from 'vitest'

import type { PredictionSummary } from '../../shared/protocol'
import {
  applyFilters,
  barPlace,
  checks,
  cleanRule,
  companyName,
  csvFileName,
  csvText,
  DEFAULT_RULE,
  facetCounts,
  loadRule,
  logRows,
  NO_FILTERS,
  saveRule,
  sortRows,
  togglePick,
  upside
} from './screen'

const p = (over: Partial<PredictionSummary> = {}): PredictionSummary => ({
  prediction_id: `p-${over.ticker ?? 'X'}-${over.run_at ?? ''}`,
  cik: 1,
  ticker: 'X',
  run_at: '2026-11-08T03:00:00+00:00',
  rating: 'Hold',
  bear: 50,
  base: 120,
  bull: 200,
  grades: [],
  name: 'X Co',
  sector: 'Energy',
  share_class: '',
  score: 45,
  probability: 0.73,
  uncertainty: 'very_high',
  report_id: 'rep-x',
  price: 100,
  price_date: '2026-11-06',
  ...over
})

// Liam's own numbers on 8 Nov 2026, for four of the 39.
const MU = p({ cik: 10, ticker: 'MU', rating: 'Buy', base: 1311.1, bear: 546.1, bull: 3147.8, price: 690, score: 96.3, probability: 0.75 })
const CMCSA = p({ cik: 11, ticker: 'CMCSA', base: 38.2, bear: 24.7, bull: 59, price: 24.39, score: 44.7, probability: 0.75 })
const F = p({ cik: 12, ticker: 'F', base: 22.1, bear: 14.1, bull: 34.6, price: 12.44, score: 18.3, probability: 0.75, sector: 'Consumer Discretionary' })
const BLK = p({ cik: 13, ticker: 'BLK', rating: 'Sell', base: 1082.9, bear: 764.9, bull: 1533.2, price: 1178.87, score: 6.1, probability: 0.36, uncertainty: 'medium', sector: 'Financials' })

describe('the good-pick consensus', () => {
  it('counts the four checks the way the page says', () => {
    expect(checks(MU, DEFAULT_RULE).map((c) => c.met)).toEqual([true, true, true, true])
    expect(checks(CMCSA, DEFAULT_RULE).map((c) => c.met)).toEqual([false, true, true, true])
    expect(checks(F, DEFAULT_RULE).map((c) => c.met)).toEqual([false, true, false, true])
    expect(checks(BLK, DEFAULT_RULE).map((c) => c.met)).toEqual([false, false, false, false])
  })

  it('makes a good pick of 3 of 4 by default, and follows the rule when it changes', () => {
    const rows = logRows([MU, CMCSA, F, BLK], DEFAULT_RULE)
    expect(rows.filter((r) => r.good).map((r) => r.p.ticker)).toEqual(['MU', 'CMCSA'])
    expect(logRows([MU, CMCSA, F, BLK], { ...DEFAULT_RULE, need: 2 }).filter((r) => r.good).map((r) => r.p.ticker)).toEqual(['MU', 'CMCSA', 'F'])
    expect(logRows([MU, CMCSA], { ...DEFAULT_RULE, need: 4 }).filter((r) => r.good).map((r) => r.p.ticker)).toEqual(['MU'])
  })

  it('meets a check exactly on its number, and never without the data', () => {
    const edge = p({ base: 120, price: 100, score: 40, probability: 0.5 })
    expect(checks(edge, DEFAULT_RULE).map((c) => c.met)).toEqual([false, true, true, true])
    const bare = p({ base: null, price: null, score: null, probability: null })
    expect(upside(bare)).toBeNull()
    expect(checks(bare, DEFAULT_RULE).some((c) => c.met)).toBe(false)
  })

  it('counts only the newest prediction for a company as a good pick', () => {
    const old = { ...MU, prediction_id: 'old', run_at: '2026-10-01T00:00:00+00:00' }
    const rows = logRows([MU, old], DEFAULT_RULE)
    expect(rows.map((r) => [r.newest, r.good])).toEqual([
      [true, true],
      [false, false]
    ])
  })

  it('keeps a stored rule inside the page’s limits', () => {
    expect(cleanRule({ need: 9, minUpside: -5, minScore: 41.4, minChance: 'x' })).toEqual({ need: 4, minUpside: 0, minScore: 41, minChance: 50 })
    const box = new Map<string, string>()
    const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) }
    expect(loadRule(store)).toEqual(DEFAULT_RULE)
    saveRule({ need: 2, minUpside: 30, minScore: 50, minChance: 60 }, store)
    expect(loadRule(store)).toEqual({ need: 2, minUpside: 30, minScore: 50, minChance: 60 })
    expect(loadRule({ getItem: () => '{not json', setItem: () => undefined })).toEqual(DEFAULT_RULE)
  })
})

describe('filters and counts', () => {
  const rows = logRows([MU, CMCSA, F, BLK], DEFAULT_RULE)

  it('shows everything by default', () => {
    expect(applyFilters(rows, NO_FILTERS)).toHaveLength(4)
  })

  it('narrows by good picks, rating, sector, risk and grades, together', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, goodOnly: true }).map((r) => r.p.ticker)).toEqual(['MU', 'CMCSA'])
    expect(applyFilters(rows, { ...NO_FILTERS, ratings: ['Buy', 'Sell'] }).map((r) => r.p.ticker)).toEqual(['MU', 'BLK'])
    expect(applyFilters(rows, { ...NO_FILTERS, sectors: ['Energy'], risks: ['very_high'] }).map((r) => r.p.ticker)).toEqual(['MU', 'CMCSA'])
    expect(applyFilters(rows, { ...NO_FILTERS, grades: ['graded'] })).toEqual([])
  })

  it('counts each option against the other filters', () => {
    const f = { ...NO_FILTERS, sectors: ['Energy'] }
    expect(facetCounts(rows, f, 'ratings')).toEqual(new Map([['Buy', 1], ['Hold', 1]]))
    // A facet's own choice doesn't hide its other options.
    expect(facetCounts(rows, f, 'sectors')).toEqual(new Map([['Energy', 2], ['Consumer Discretionary', 1], ['Financials', 1]]))
  })
})

describe('sorting', () => {
  const rows = logRows([BLK, F, CMCSA, MU], DEFAULT_RULE)
  it('puts the most checks first, then the most upside', () => {
    expect(sortRows(rows, 'checks').map((r) => r.p.ticker)).toEqual(['MU', 'CMCSA', 'F', 'BLK'])
    expect(sortRows(rows, 'upside').map((r) => r.p.ticker)).toEqual(['MU', 'F', 'CMCSA', 'BLK'])
    expect(sortRows(rows, 'score').map((r) => r.p.ticker)).toEqual(['MU', 'CMCSA', 'F', 'BLK'])
    expect(sortRows(rows, 'ticker').map((r) => r.p.ticker)).toEqual(['BLK', 'CMCSA', 'F', 'MU'])
  })
})

describe('picks', () => {
  it('adds and removes, and refuses a seventh', () => {
    expect(togglePick([1, 2], 2)).toEqual([1])
    expect(togglePick([1, 2, 3, 4, 5, 6], 7)).toEqual([1, 2, 3, 4, 5, 6])
    expect(togglePick([], 9)).toEqual([9])
  })
})

describe('the bear-to-bull bar', () => {
  it('puts today in the middle of a log scale and the range around it', () => {
    const bar = barPlace(p({ bear: 50, base: 200, bull: 400, price: 100 })) as NonNullable<ReturnType<typeof barPlace>>
    // −50% and +100% sit the same distance from today.
    expect(bar.today - bar.left).toBeCloseTo(bar.base - bar.today, 6)
    expect(bar.left + bar.width).toBeGreaterThan(bar.base)
  })

  it('pins a price outside the scale to its end, and draws nothing without a range', () => {
    const far = barPlace(p({ bear: 1, base: 2, bull: 3, price: 100 })) as NonNullable<ReturnType<typeof barPlace>>
    expect(far.left).toBe(0)
    expect(far.width).toBeGreaterThan(0)
    expect(barPlace(p({ bear: null }))).toBeNull()
  })
})

describe('the CSV', () => {
  it('names the file after the day', () => {
    expect(csvFileName(new Date(2026, 10, 8))).toBe('Tearsheet predictions 8 Nov 2026.csv')
  })

  it('writes one line per shown row, quoting commas and keeping formulas as text', () => {
    const text = csvText(logRows([p({ ticker: 'AB', name: 'Alpha, Beta', sector: '=cmd()' })], DEFAULT_RULE))
    const [head, line] = text.trim().split('\n')
    expect(head.split(',')).toHaveLength(20)
    expect(line).toContain('"Alpha, Beta"')
    expect(line).toContain("'=cmd()")
    expect(line).toContain(',0.2,')
    expect(line.endsWith('Very high,3,yes,yes,,,')).toBe(true)
  })
})

describe('company names', () => {
  it('turns the SEC’s capitals into ordinary case, and leaves mixed case alone', () => {
    expect(companyName('MICRON TECHNOLOGY INC')).toBe('Micron Technology Inc')
    expect(companyName('BANK OF AMERICA CORP /DE/')).toBe('Bank Of America Corp')
    expect(companyName('Phillips 66')).toBe('Phillips 66')
  })
})
