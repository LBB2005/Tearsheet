// The stock menu's options (stock/menu.ts): which show, which are greyed and why, and what each
// one does; and the facts it reads from the app's lists.

import { describe, expect, test, vi } from 'vitest'

import type { CompanyRow, LineState, WatchList } from '../../shared/protocol'
import type { MenuEntry } from '../shell/Menu'
import { edgarUrl, stockEntries, stockFacts, type StockActions, type StockFacts } from './menu'

const facts = (over: Partial<StockFacts> = {}): StockFacts => ({ reportId: 'r-1', latest: '2026-11-05T14:00:00Z', official: false, line: null, lists: [], ...over })
const actions = (): StockActions => ({ open: vi.fn(), dig: vi.fn(), write: vi.fn(), watch: vi.fn(), unwatch: vi.fn(), log: vi.fn(), copy: vi.fn(), edgar: vi.fn() })
const AAPL = { ticker: 'AAPL', cik: 320193 }

// Each entry as one line: "Open report", "Compare (Six at most)", "✓ Core", "Watchlists:", "—".
const lines = (entries: MenuEntry[]) =>
  entries.map((e) => {
    if (e.kind === 'separator') return '—'
    if (e.kind === 'heading') return `${e.label}:`
    if (e.kind === 'check') return `${e.checked ? '✓' : '·'} ${e.label}`
    return e.disabled ? `${e.label} (${e.note})` : e.label
  })
const pick = (entries: MenuEntry[], label: string) => {
  const e = entries.find((x) => x.kind !== 'separator' && x.label === label)
  if (!e || (e.kind !== 'item' && e.kind !== 'check')) throw new Error(`no ${label}`)
  e.onSelect()
}

describe('stockEntries', () => {
  test('a company with a report and no lists yet', () => {
    expect(lines(stockEntries(AAPL, facts(), actions()))).toEqual(['Open report', 'Dig deeper', 'Refresh report…', '—', 'Add to watchlist', '—', 'Copy ticker', 'Open on SEC EDGAR'])
  })

  test('each option does its action', () => {
    const act = actions()
    const entries = stockEntries(AAPL, facts({ official: true }), act)
    for (const label of ['Open report', 'Dig deeper', 'Refresh report…', 'Add to watchlist', 'Show in Prediction log', 'Copy ticker', 'Open on SEC EDGAR']) pick(entries, label)
    expect(act.open).toHaveBeenCalledWith('r-1')
    expect(act.dig).toHaveBeenCalled()
    expect(act.write).toHaveBeenCalled()
    expect(act.watch).toHaveBeenCalledWith(null)
    expect(act.log).toHaveBeenCalled()
    expect(act.copy).toHaveBeenCalled()
    expect(act.edgar).toHaveBeenCalled()
  })

  test('with no report, Open and Dig deeper are greyed and Write a report… takes their place', () => {
    const act = actions()
    const entries = stockEntries({ ticker: 'LULU' }, facts({ reportId: null, latest: null }), act)
    expect(lines(entries).slice(0, 3)).toEqual(['Open report (No report yet)', 'Dig deeper (No report yet)', 'Write a report…'])
    pick(entries, 'Open report')
    pick(entries, 'Dig deeper')
    expect(act.open).not.toHaveBeenCalled()
    expect(act.dig).not.toHaveBeenCalled()
  })

  test('in the line, writing is greyed with where it is', () => {
    expect(lines(stockEntries(AAPL, facts({ line: 'writing' }), actions()))[2]).toBe('Refresh report… (Being written now)')
    expect(lines(stockEntries(AAPL, facts({ line: 'waiting', reportId: null, latest: null }), actions()))[2]).toBe('Write a report… (In the line)')
  })

  test('on the open report, Open report says so', () => {
    expect(lines(stockEntries(AAPL, facts(), actions(), { here: 'report' }))[0]).toBe('Open report (Open now)')
  })

  test('on its Dig deeper page, Dig deeper says so and Open report still opens', () => {
    const act = actions()
    const entries = stockEntries(AAPL, facts(), act, { here: 'dig' })
    expect(lines(entries).slice(0, 2)).toEqual(['Open report', 'Dig deeper (Open now)'])
    pick(entries, 'Dig deeper')
    expect(act.dig).not.toHaveBeenCalled()
  })

  test('one list: Add, or Remove once it is on it', () => {
    const act = actions()
    const core = { list_id: 7, name: 'Core', on: false }
    pick(stockEntries(AAPL, facts({ lists: [core] }), act), 'Add to watchlist')
    expect(act.watch).toHaveBeenCalledWith(7)
    const on = { ...core, on: true }
    const entries = stockEntries(AAPL, facts({ lists: [on] }), act)
    expect(lines(entries)).toContain('Remove from watchlist')
    pick(entries, 'Remove from watchlist')
    expect(act.unwatch).toHaveBeenCalledWith(on)
  })

  test('several lists: a tick for each, and a tick adds or takes out', () => {
    const act = actions()
    const lists = [
      { list_id: 1, name: 'Core', on: true },
      { list_id: 2, name: 'Chips', on: false }
    ]
    const entries = stockEntries(AAPL, facts({ lists }), act)
    expect(lines(entries).slice(3, 7)).toEqual(['—', 'Watchlists:', '✓ Core', '· Chips'])
    pick(entries, 'Core')
    expect(act.unwatch).toHaveBeenCalledWith(lists[0])
    pick(entries, 'Chips')
    expect(act.watch).toHaveBeenCalledWith(2)
  })

  test('while the lists load, Add waits', () => {
    expect(lines(stockEntries(AAPL, facts({ lists: null }), actions()))).toContain('Add to watchlist (Checking…)')
  })

  test('Compare on a page with a chart: ticks, unticks, or says why not', () => {
    const toggle = vi.fn()
    const entries = stockEntries(AAPL, facts(), actions(), { compare: { on: false, toggle } })
    expect(lines(entries)).toContain('Compare')
    pick(entries, 'Compare')
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(lines(stockEntries(AAPL, facts(), actions(), { compare: { on: true, toggle } }))).toContain('Stop comparing')
    expect(lines(stockEntries(AAPL, facts(), actions(), { compare: { on: false, toggle, why: 'Six at most' } }))).toContain('Compare (Six at most)')
  })

  test('the log is offered for an official prediction, but not on the log', () => {
    expect(lines(stockEntries(AAPL, facts({ official: true }), actions()))).toContain('Show in Prediction log')
    expect(lines(stockEntries(AAPL, facts({ official: true }), actions(), { here: 'log' }))).not.toContain('Show in Prediction log')
    expect(lines(stockEntries(AAPL, facts(), actions()))).not.toContain('Show in Prediction log')
  })

  test('a surface’s own options come last', () => {
    const more: MenuEntry[] = [{ kind: 'item', label: 'Pin to top', onSelect: vi.fn() }]
    expect(lines(stockEntries(AAPL, facts(), actions(), { more })).slice(-2)).toEqual(['—', 'Pin to top'])
  })
})

test('edgarUrl goes by the CIK, or by the ticker without one', () => {
  expect(edgarUrl({ ticker: 'AAPL', cik: 320193 })).toBe('https://www.sec.gov/edgar/browse/?CIK=320193')
  expect(edgarUrl({ ticker: 'BRK.B' })).toBe('https://www.sec.gov/edgar/browse/?CIK=BRK.B')
})

describe('stockFacts', () => {
  const company = (over: Partial<CompanyRow>): CompanyRow => ({
    cik: 320193,
    ticker: 'AAPL',
    name: 'Apple Inc.',
    report_id: 'r-aapl-2',
    report_date: '2026-11-05',
    created_at: '2026-11-05T14:00:00Z',
    reports: 2,
    report_ids: ['r-aapl-2'],
    price: 230,
    price_date: '2026-11-06',
    since_report: 0,
    rating: 'Buy',
    official: true,
    sector: null,
    pinned: false,
    ...over
  })
  const list = (list_id: number, name: string, ciks: number[]): WatchList => ({ list_id, name, position: list_id, count: ciks.length, ciks })
  const line = (writing: string | null, waiting: string[]): LineState => ({
    writing: writing ? { ticker: writing, name: writing, official: true } : null,
    waiting: waiting.map((t) => ({ ticker: t, name: t, official: true })),
    finished: [],
    paused: null
  })

  test('reads the latest report from the sidebar’s companies, by CIK or by ticker', () => {
    const f = stockFacts({ ticker: 'AAPL' }, [company({})], null, null)
    expect(f).toEqual({ reportId: 'r-aapl-2', latest: '2026-11-05T14:00:00Z', official: true, line: null, lists: null, cik: 320193 })
    // A row's own report (a prediction's, a hidden one) wins.
    expect(stockFacts({ ticker: 'AAPL', reportId: 'r-aapl-1' }, [company({})], null, null).reportId).toBe('r-aapl-1')
    expect(stockFacts({ ticker: 'LULU', cik: 1397187 }, [company({})], null, null)).toMatchObject({ reportId: null, latest: null, official: false, cik: 1397187 })
  })

  test('says where it is in the line', () => {
    expect(stockFacts({ ticker: 'AAPL' }, [], line('AAPL', []), null).line).toBe('writing')
    expect(stockFacts({ ticker: 'AAPL' }, [], line('MSFT', ['AAPL']), null).line).toBe('waiting')
  })

  test('ticks the lists it is on, and finds its CIK there', () => {
    const watched = { lists: [list(1, 'Core', [2488]), list(2, 'Chips', [])], rows: [{ cik: 2488, ticker: 'AMD', lists: [1] }] }
    expect(stockFacts({ ticker: 'AMD' }, [], null, watched)).toMatchObject({
      cik: 2488,
      lists: [
        { list_id: 1, name: 'Core', on: true },
        { list_id: 2, name: 'Chips', on: false }
      ]
    })
  })
})
