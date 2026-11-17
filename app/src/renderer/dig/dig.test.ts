// Dig deeper's page logic (dig/dig.ts): when to fetch again, what each part's state line says, and
// how its numbers read.

import { describe, expect, test } from 'vitest'

import { digPage, digSnapshot } from '../test/dig'
import { asOfLine, compact, metricText, needsRefresh, partNote, rangeSpots, subtitle, toneLine, tradeLine } from './dig'

const AT = (iso: string) => new Date(iso)

describe('needsRefresh', () => {
  test('with no snapshot, or one more than 6 hours old', () => {
    expect(needsRefresh(digPage(320193, { snapshot: null }), AT('2026-11-17T22:30:00Z'))).toBe(true)
    expect(needsRefresh(digPage(), AT('2026-11-18T04:30:00Z'))).toBe(false) // exactly 6 hours
    expect(needsRefresh(digPage(), AT('2026-11-18T04:30:01Z'))).toBe(true)
  })

  test('never for a company with nothing to dig from', () => {
    expect(needsRefresh(digPage(320193, { snapshot: null, has_report: false }), AT('2026-11-17T22:30:00Z'))).toBe(false)
  })
})

describe('partNote', () => {
  const part = (state: 'ok' | 'stale' | 'off' | 'down', note: string | null = null) => ({ state, note, as_of: '2026-11-15T21:00:00+00:00' })
  test('says nothing when fresh, and dates a stale part', () => {
    expect(partNote(part('ok'), 'FRED')).toBeNull()
    expect(partNote(part('stale', 'FRED didn’t answer.'), 'FRED', AT('2026-11-17T12:00:00Z'))).toBe('From Nov 15: FRED didn’t answer this time.')
  })
  test('gives the engine’s reason when off or down, else a plain one', () => {
    expect(partNote(part('off', 'Add a FRED key in Settings to see rates.'), 'FRED')).toBe('Add a FRED key in Settings to see rates.')
    expect(partNote(part('down'), 'SEC Form 4 filings')).toBe('SEC Form 4 filings didn’t answer.')
  })
})

test('asOfLine names the close and when it was gathered', () => {
  expect(asOfLine(digSnapshot(), AT('2026-11-17T23:00:00Z'))).toBe('Prices to the close of Nov 16. Gathered Nov 17.')
})

test('subtitle names the company', () => {
  expect(subtitle(digPage())).toBe('Apple Inc.')
})

describe('rangeSpots', () => {
  const lv = digSnapshot().header.levels!
  test('places the low, base, high, close and triggers on one log scale', () => {
    const s = rangeSpots(lv, 236.5)!
    expect(s.bear).toBeLessThan(s.sell!)
    expect(s.sell!).toBeLessThan(s.now)
    expect(s.now).toBeLessThan(s.buy!)
    expect(s.buy!).toBeLessThan(s.base)
    expect(s.base).toBeLessThan(s.bull)
    expect(s.then).not.toBeNull()
    expect(Math.min(s.bear, s.now)).toBeGreaterThan(0)
    expect(Math.max(s.bull, s.now)).toBeLessThan(100)
  })
  test('leaves out a trigger the price can’t reach, and gives nothing without a range', () => {
    expect(rangeSpots({ ...lv, buy_reachable: false }, 236.5)!.buy).toBeNull()
    expect(rangeSpots({ ...lv, bear: null }, 236.5)).toBeNull()
  })
})

test('metricText: multiples with a ×, the rest as percents, and a dash for none', () => {
  expect(metricText('interest_coverage', 46.8)).toBe('46.8×')
  expect(metricText('operating_cash_flow_to_net_income', 1.197)).toBe('1.2×')
  expect(metricText('operating_margin', 0.3112)).toBe('31.1%')
  expect(metricText('operating_margin', null)).toBe('—')
})

test('compact money', () => {
  expect(compact(6_900_000)).toBe('$6.9M')
  expect(compact(230_000)).toBe('$230K')
  expect(compact(1_250_000_000)).toBe('$1.3B')
  expect(compact(950)).toBe('$950')
})

test('toneLine counts each tone, leaving out none', () => {
  expect(toneLine({ positive: 21, neutral: 18, negative: 10, unknown: 1 })).toBe('21 positive, 18 neutral, 10 negative, 1 with no tone')
  expect(toneLine({ positive: 0, neutral: 0, negative: 0, unknown: 0 })).toBe('No articles')
})

test('tradeLine', () => {
  expect(tradeLine({ trades: 2, people: 2, shares: 30000, value: 6_900_000 })).toBe('2 trades by 2 people: 30,000 shares, $6.9M')
  expect(tradeLine({ trades: 1, people: 1, shares: 1000, value: 0 })).toBe('1 trade by 1 person: 1,000 shares')
  expect(tradeLine({ trades: 0, people: 0, shares: 0, value: 0 })).toBe('None')
  expect(tradeLine(null)).toBe('—')
})
