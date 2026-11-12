import { describe, expect, test } from 'vitest'

import type { WatchPage, WatchRow } from '../../shared/protocol'
import { WATCH_ROWS } from '../test/watch'
import { readable, attention, averageSince, barSpot, flipOf, groups, liveKey, loadKey, loadPick, needsLook, rowsOf, saveKey, savePick, toQueue, topReason, watchCsv, watchCsvName } from './watch'

const { AMD, MU, LULU, TSLA } = WATCH_ROWS
const page = (rows: WatchRow[], lists: { id: number; name: string; ciks: number[] }[]): WatchPage => ({
  lists: lists.map((l, i) => ({ list_id: l.id, name: l.name, position: i, count: l.ciks.length, ciks: l.ciks })),
  rows: rows.map((r) => ({ ...r, lists: lists.filter((l) => l.ciks.includes(r.cik)).map((l) => l.id) })),
  counts: { watched: rows.length, needs_look: 0, no_report: 0 },
  as_of: '2026-11-11',
  prices_note: null
})
const P = page([AMD, MU, LULU, TSLA], [
  { id: 1, name: 'Core', ciks: [MU.cik, AMD.cik] },
  { id: 2, name: 'Chips', ciks: [MU.cik] }
])

describe('lists', () => {
  test('a list keeps its own order; smart lists pick by state', () => {
    expect(rowsOf(P, 1).map((r) => r.ticker)).toEqual(['MU', 'AMD'])
    expect(rowsOf(P, 'all').map((r) => r.ticker)).toEqual(['AMD', 'MU', 'LULU', 'TSLA'])
    expect(rowsOf(P, 'look').map((r) => r.ticker)).toEqual(['AMD', 'MU'])
    expect(rowsOf(P, 'norep').map((r) => r.ticker)).toEqual(['LULU'])
    expect(rowsOf(P, 99)).toEqual([])
  })
  test('a deleted list falls back to All watched', () => {
    expect(liveKey(P, 2)).toBe(2)
    expect(liveKey(P, 7)).toBe('all')
    expect(liveKey(P, 'look')).toBe('look')
  })
  test('All watched groups by list, a company under each of its lists, then those in no list', () => {
    expect(groups(P).map((g) => [g.name, g.rows.map((r) => r.ticker)])).toEqual([
      ['Core', ['MU', 'AMD']],
      ['Chips', ['MU']],
      ['In no list', ['LULU', 'TSLA']]
    ])
  })
})

describe('what needs a look', () => {
  test('an unseen alert or a reason the engine gives; no report and stale prices are facts, not news', () => {
    expect(needsLook(AMD)).toBe(true)
    expect(needsLook(MU)).toBe(true)
    expect(needsLook(LULU)).toBe(false)
    expect(needsLook(TSLA)).toBe(false)
    expect(needsLook({ ...TSLA, unseen: 2 })).toBe(true)
  })
  test('the strip puts unseen alerts first, each company once', () => {
    const rows = [MU, AMD, AMD]
    expect(attention(rows).map((a) => a.row.ticker)).toEqual(['AMD', 'MU'])
    expect(attention(rows)[0].reason?.text).toBe('Up 23.1% since the Nov 7 report.')
  })
  test('the first reason shown is the most urgent kind', () => {
    const row = { ...TSLA, reasons: [{ kind: 'stale' as const, text: 'Old price.' }, { kind: 'outside' as const, text: 'Below its low.' }] }
    expect(topReason(row)?.text).toBe('Below its low.')
    expect(topReason(TSLA)).toBeNull()
  })
})

describe('numbers', () => {
  test('the average move since the report leaves out companies with none', () => {
    expect(averageSince([AMD, MU, LULU])).toBeCloseTo((0.2313 + 0.1758) / 2)
    expect(averageSince([LULU])).toBeNull()
  })
  test('a row’s bar: low, base, high, now and then on one log scale inside 0–100', () => {
    const s = barSpot(AMD)!
    expect(s.bear).toBeLessThan(s.then!)
    expect(s.then!).toBeLessThan(s.now)
    expect(s.now).toBeLessThan(s.bull)
    for (const v of [s.bear, s.base, s.bull, s.now]) expect(v).toBeGreaterThanOrEqual(0)
    expect(barSpot(LULU)).toBeNull()
  })
  test('a price past the high stays on the bar', () => {
    const s = barSpot({ ...TSLA, price: 900 })!
    expect(s.now).toBeLessThanOrEqual(100)
    expect(s.now).toBeGreaterThan(s.bull)
  })
  test('the rating-change price: only one the price can reach, and what the rating would turn to', () => {
    expect(flipOf(AMD)).toEqual({ price: 297.54, above: false, to: 'Sell' })
    expect(flipOf(MU)).toEqual({ price: 2119.78, above: true, to: 'Hold' })
    expect(flipOf(TSLA)).toBeNull()
    expect(flipOf(LULU)).toBeNull()
  })
  test('queue: no report yet, or a new report would be official; not one already in the line', () => {
    expect(toQueue([AMD, LULU, { ...TSLA, slot_open: true }, { ...TSLA, slot_open: true }]).map((r) => r.ticker)).toEqual(['TSLA'])
    expect(toQueue([{ ...LULU, queued: null }]).map((r) => r.ticker)).toEqual(['LULU'])
  })
})

describe('kept choices', () => {
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }
  test('the list and the company come back; anything else is All watched and nothing', () => {
    const s = store()
    saveKey(3, s)
    savePick(2488, s)
    expect(loadKey(s)).toBe(3)
    expect(loadPick(s)).toBe(2488)
    saveKey('norep', s)
    expect(loadKey(s)).toBe('norep')
    s.setItem('watch.list', 'nonsense')
    expect(loadKey(s)).toBe('all')
    expect(loadKey(null)).toBe('all')
    expect(loadPick(store())).toBeNull()
  })
  test('storage that throws is ignored', () => {
    const bad = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } }
    expect(loadKey(bad)).toBe('all')
    expect(() => saveKey(1, bad)).not.toThrow()
  })
})

describe('the CSV', () => {
  test('one row per company with its lists, numbers and note, safe in a spreadsheet', () => {
    const text = watchCsv([{ ...P.rows[0], note: '=SUM(A1), "really"' }, P.rows[2]], P.lists)
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('Ticker,Company,Lists,Price,Price date,Rating,Low,Base,High,Since report %,To base %,Report date,Note')
    expect(lines[1]).toBe('AMD,Advanced Micro Devices,Core,552.90,2026-11-11,Hold,176.03,394.02,881.94,23.1,-28.7,2026-11-07,"\'=SUM(A1), ""really"""')
    expect(lines[2]).toBe('LULU,Lululemon Athletica,,107.45,2026-11-11,,,,,,,,')
  })
  test('the file name says the list and the day', () => {
    expect(watchCsvName('Chips & hardware', new Date('2026-11-12T12:00:00'))).toBe('Tearsheet Chips  hardware 12 Nov 2026.csv')
    expect(watchCsvName('***', new Date('2026-11-12T12:00:00'))).toBe('Tearsheet Watchlist 12 Nov 2026.csv')
  })
})

describe('the engine’s sentences', () => {
  test('dates read as the app writes them', () => {
    const now = new Date('2026-11-12T12:00:00')
    expect(readable('Up 23.1% since the 7 Nov 2026 report.', now)).toBe('Up 23.1% since the Nov 7 report.')
    expect(readable('Its last one was made on 20 Oct 2025.', now)).toBe('Its last one was made on Oct 20, 2025.')
    expect(readable('No report yet.', now)).toBe('No report yet.')
  })
})
