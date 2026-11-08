import { describe, expect, it } from 'vitest'

import type { CompanyRow } from '../../shared/protocol'
import { dateGroup, DEFAULT_PREFS, deleteNotice, filtersOn, groupRows, kept, loadPrefs, matches, moveText, savePrefs, sectorsOf, selectRange, sortRows, type ListPrefs } from './reportList'

// Saturday 7 November 2026, 9 pm local time.
const NOW = new Date(2026, 10, 7, 21, 0)
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).toISOString()

const row = (ticker: string, over: Partial<CompanyRow> = {}): CompanyRow => ({
  cik: ticker.length * 1000 + ticker.charCodeAt(0),
  ticker,
  name: `${ticker} Inc.`,
  report_id: `r-${ticker}`,
  report_date: '2026-11-07',
  created_at: at(7),
  reports: 1,
  report_ids: [`r-${ticker}`],
  price: 100,
  price_date: '2026-11-06',
  since_report: 0,
  rating: 'Hold',
  official: false,
  sector: 'Information Technology',
  pinned: false,
  ...over
})

const ROWS = [
  row('RDDT', { name: 'Reddit, Inc.', created_at: at(7, 20), official: true, sector: 'Communication Services', since_report: 0.01 }),
  row('COST', { name: 'COSTCO WHOLESALE CORP /NEW', created_at: at(7, 19), rating: 'Sell', official: true, sector: 'Consumer Staples', since_report: -0.05 }),
  row('MU', { name: 'MICRON TECHNOLOGY INC', created_at: at(6), rating: 'Buy', official: true, since_report: null }),
  row('AMD', { name: 'ADVANCED MICRO DEVICES INC', created_at: at(3), official: true, since_report: 0.2 }),
  row('NVDA', { name: 'NVIDIA CORP', created_at: at(1), since_report: -0.067 }),
  row('AAPL', { name: 'Apple Inc.', created_at: new Date(2026, 8, 1).toISOString(), rating: null })
]

const prefs = (over: Partial<ListPrefs> = {}): ListPrefs => ({ ...DEFAULT_PREFS, ...over })
const tickers = (rows: CompanyRow[]) => rows.map((r) => r.ticker)

describe('the search', () => {
  it('finds a ticker by its start, and a name by any of its words', () => {
    expect(matches(ROWS[0], 'rd')).toBe(true)
    expect(matches(ROWS[0], ' REDD ')).toBe(true)
    expect(matches(ROWS[0], 'dit')).toBe(false)
    expect(tickers(ROWS.filter((r) => matches(r, 'micro')))).toEqual(['MU', 'AMD'])
    expect(matches(ROWS[1], 'wholesale')).toBe(true)
    expect(matches(ROWS[1], '')).toBe(true)
    expect(matches({ ticker: null, name: null }, 'x')).toBe(false)
  })
})

describe('the filters', () => {
  it('leave out the ratings unticked, and reports with no rating while any is', () => {
    expect(tickers(ROWS.filter((r) => kept(r, prefs({ hideRatings: ['Hold'] }), '')))).toEqual(['COST', 'MU'])
    expect(tickers(ROWS.filter((r) => kept(r, prefs(), '')))).toHaveLength(6)
  })

  it('keep only official predictions, or one sector', () => {
    expect(tickers(ROWS.filter((r) => kept(r, prefs({ officialOnly: true }), '')))).toEqual(['RDDT', 'COST', 'MU', 'AMD'])
    expect(tickers(ROWS.filter((r) => kept(r, prefs({ sector: 'Consumer Staples' }), '')))).toEqual(['COST'])
    expect(kept(ROWS[0], prefs(), 'zz')).toBe(false)
  })

  it('count what is on, not the sort or the Hidden group', () => {
    expect(filtersOn(prefs())).toBe(0)
    expect(filtersOn(prefs({ sort: 'az', showHidden: true }))).toBe(0)
    expect(filtersOn(prefs({ hideRatings: ['Buy', 'Sell'], officialOnly: true, sector: 'Energy' }))).toBe(3)
  })

  it('offer the sectors of the companies listed, A to Z', () => {
    expect(sectorsOf(ROWS)).toEqual(['Communication Services', 'Consumer Staples', 'Information Technology'])
    expect(sectorsOf([row('X', { sector: null })])).toEqual([])
  })
})

describe('the sorts', () => {
  it('put the newest report first, A to Z, Buy first, or the biggest move either way first', () => {
    expect(tickers(sortRows([...ROWS].reverse(), 'newest'))).toEqual(['RDDT', 'COST', 'MU', 'AMD', 'NVDA', 'AAPL'])
    expect(tickers(sortRows(ROWS, 'az'))).toEqual(['AAPL', 'AMD', 'COST', 'MU', 'NVDA', 'RDDT'])
    expect(tickers(sortRows(ROWS, 'rating'))).toEqual(['MU', 'RDDT', 'AMD', 'NVDA', 'COST', 'AAPL'])
    expect(tickers(sortRows(ROWS, 'move'))).toEqual(['AMD', 'NVDA', 'COST', 'RDDT', 'AAPL', 'MU'])
  })
})

describe('the groups', () => {
  it('go by the local day of the report', () => {
    expect(dateGroup(at(7, 0), NOW)).toBe('Today')
    expect(dateGroup(at(6, 23), NOW)).toBe('Yesterday')
    expect(dateGroup(at(1), NOW)).toBe('Previous 7 days')
    expect(dateGroup(new Date(2026, 9, 20).toISOString(), NOW)).toBe('Previous 30 days')
    expect(dateGroup(new Date(2026, 8, 1).toISOString(), NOW)).toBe('Older')
    expect(dateGroup('not a date', NOW)).toBe('Older')
  })

  it('show pinned companies first, then the date groups', () => {
    const rows = ROWS.map((r) => (r.ticker === 'NVDA' ? { ...r, pinned: true } : r))
    const groups = groupRows(rows, prefs(), '', NOW)
    expect(groups.map((g) => [g.label, tickers(g.rows)])).toEqual([
      ['Pinned', ['NVDA']],
      ['Today', ['RDDT', 'COST']],
      ['Yesterday', ['MU']],
      ['Previous 7 days', ['AMD']],
      ['Older', ['AAPL']]
    ])
  })

  it('go by rating under the rating sort, and are one list otherwise', () => {
    expect(groupRows(ROWS, prefs({ sort: 'rating' }), '', NOW).map((g) => g.label)).toEqual(['Buy', 'Hold', 'Sell', 'No rating'])
    const az = groupRows(ROWS, prefs({ sort: 'az' }), '', NOW)
    expect(az).toHaveLength(1)
    expect(az[0].label).toBeNull()
    const pinned = groupRows([{ ...ROWS[0], pinned: true }, ...ROWS.slice(1)], prefs({ sort: 'az' }), '', NOW)
    expect(pinned.map((g) => g.label)).toEqual(['Pinned', 'Others'])
  })

  it('leave out what the search and the filters leave out', () => {
    expect(groupRows(ROWS, prefs({ officialOnly: true }), 'micro', NOW).flatMap((g) => tickers(g.rows))).toEqual(['MU', 'AMD'])
    expect(groupRows(ROWS, prefs(), 'zzz', NOW)).toEqual([])
  })
})

describe('selecting several', () => {
  it('takes every row from the anchor to the one ⇧-clicked, either way', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(selectRange(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(selectRange(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(selectRange(order, null, 'c')).toEqual(['c'])
    expect(selectRange(order, 'gone', 'c')).toEqual(['c'])
    expect(selectRange(order, 'a', 'gone')).toEqual([])
  })
})

describe('the words', () => {
  it('give the move since the report with a sign', () => {
    expect(moveText(0.012)).toBe('+1.2%')
    expect(moveText(-0.067)).toBe('−6.7%')
    expect(moveText(0.0001)).toBe('0.0%')
    expect(moveText(null)).toBeNull()
  })

  it('say what a delete did', () => {
    const one = [{ ticker: 'MSFT' }]
    expect(deleteNotice(one, 1, 1)).toEqual({ title: 'Deleted the MSFT report' })
    expect(deleteNotice(one, 3, 3)).toEqual({ title: 'Deleted MSFT’s 3 reports' })
    expect(deleteNotice([{ ticker: 'A' }, { ticker: 'B' }], 2, 2)).toEqual({ title: 'Deleted 2 reports' })
    expect(deleteNotice(one, 1, 0).title).toBe('Hid the MSFT report')
    expect(deleteNotice(one, 1, 0).text).toContain('stays in the Prediction log')
    expect(deleteNotice(one, 2, 0).title).toBe('Hid MSFT’s 2 reports')
    expect(deleteNotice([{ ticker: 'A' }, { ticker: 'B' }], 3, 0).title).toBe('Hid 3 reports')
    expect(deleteNotice(one, 2, 1).title).toBe('Deleted a report and hid one')
    expect(deleteNotice([{ ticker: 'A' }, { ticker: 'B' }], 5, 3).title).toBe('Deleted 3 reports and hid 2')
  })
})

describe('the kept sort and filters', () => {
  const store = () => {
    const kept = new Map<string, string>()
    return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) }
  }

  it('come back as they were left', () => {
    const s = store()
    const left = prefs({ sort: 'rating', hideRatings: ['Sell'], officialOnly: true, sector: 'Energy', showHidden: true })
    savePrefs(left, s)
    expect(loadPrefs(s)).toEqual(left)
  })

  it('fall back to the defaults for anything unreadable', () => {
    const s = store()
    expect(loadPrefs(s)).toEqual(DEFAULT_PREFS)
    s.setItem('sidebar.list', '{not json')
    expect(loadPrefs(s)).toEqual(DEFAULT_PREFS)
    s.setItem('sidebar.list', JSON.stringify({ sort: 'size', hideRatings: ['Buy', 'Maybe'], officialOnly: 'yes', sector: 3 }))
    expect(loadPrefs(s)).toEqual({ ...DEFAULT_PREFS, hideRatings: ['Buy'] })
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS)
    const broken = {
      getItem: () => {
        throw new Error('no storage')
      },
      setItem: () => {
        throw new Error('no storage')
      }
    }
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS)
    expect(() => savePrefs(DEFAULT_PREFS, broken)).not.toThrow()
  })
})
