// A Dig deeper page for the fake engine: Apple, made up in the engine's own shape
// (protocol.DigPage). Every number, name, headline and address here is invented.

import type { DigPage, DigPeerRow, DigSnapshot } from '../../shared/protocol'
import { analysts } from './analysts'

const AS_OF = '2026-11-17T22:30:00+00:00'

const DATES = ['2025-11-17', '2026-02-17', '2026-05-18', '2026-08-17', '2026-11-16']

export function digSnapshot(cik = 320193, changes: Partial<DigSnapshot> = {}): DigSnapshot {
  return {
    snapshot_id: `dig-${cik}-20261117T223000Z-abc123`,
    cik,
    created_at: AS_OF,
    close_date: '2026-11-16',
    report_id: 'r-aapl-2',
    run_id: 'run-a2',
    versions: { dig_code: 1, engine: '0.1.0-beta' },
    header: {
      cik,
      ticker: 'AAPL',
      name: 'Apple Inc.',
      sector: 'Information Technology',
      close: 236.5,
      close_date: '2026-11-16',
      since_report: 0.0278,
      made_at: '2026-11-05T14:00:00Z',
      levels: {
        report_id: 'r-aapl-2',
        report_date: '2026-11-05',
        price_date: '2026-11-04',
        official: true,
        rating: 'Buy',
        capped: false,
        report_price: 230.1,
        bear: 190,
        base: 250,
        bull: 290,
        buy_trigger: 238,
        sell_trigger: 201,
        buy_reachable: true,
        sell_reachable: true,
        score_percentile: 72,
        uncertainty: 'medium',
        source: 'run'
      }
    },
    sector: {
      state: 'ok',
      note: null,
      as_of: AS_OF,
      sector: 'Information Technology',
      members: 74,
      left_out: 1,
      dates: DATES,
      stock: [100, 104.2, 99.1, 108.7, 112.3],
      sector_line: [100, 101.5, 103.2, 110.4, 118.9],
      spy: [100, 102.1, 101.4, 106.9, 111.3],
      returns: [
        { period: '1M', stock: 0.021, sector_median: -0.012, spy: 0.008 },
        { period: '3M', stock: 0.033, sector_median: 0.051, spy: 0.041 },
        { period: '6M', stock: 0.133, sector_median: 0.152, spy: 0.098 },
        { period: '12M', stock: 0.123, sector_median: 0.189, spy: 0.113 }
      ],
      rank: 41,
      rank_of: 75
    },
    market: {
      state: 'ok',
      note: null,
      as_of: AS_OF,
      spy_12m: 0.1129,
      volatility_percentile: 94.3,
      scaling_on: false,
      scaling_note: 'Momentum scaling is off.'
    },
    rates: {
      state: 'ok',
      note: null,
      as_of: AS_OF,
      rates: [
        { id: 'UNRATE', label: 'Unemployment rate', value: 0.041, date: '2026-10-01' },
        { id: 'DGS10', label: '10-year Treasury yield', value: 0.0412, date: '2026-11-13' }
      ]
    },
    peers: {
      state: 'ok',
      note: null,
      as_of: AS_OF,
      run_id: 'run-a2',
      report_date: '2026-11-05',
      price_date: '2026-11-04',
      columns: [
        { key: 'operating_margin', label: 'Operating margin' },
        { key: 'free_cash_flow_yield', label: 'Free cash flow yield' }
      ],
      rows: (
        [
        { cik, ticker: 'AAPL', name: 'Apple Inc.', is_company: true, numbers: { operating_margin: 0.31, free_cash_flow_yield: 0.034 }, score: 72.5, rating: 'Buy', rated_at: '2026-11-05', since_report: 0.031, return_12m: 0.123 },
        { cik: 1045810, ticker: 'NVDA', name: 'NVIDIA Corp', is_company: false, numbers: { operating_margin: 0.62, free_cash_flow_yield: 0.021 }, score: 90, rating: null, rated_at: null, since_report: 0.05, return_12m: 0.41 },
        { cik: 789019, ticker: 'MSFT', name: 'Microsoft Corp', is_company: false, numbers: { operating_margin: 0.45, free_cash_flow_yield: null }, score: 60, rating: 'Hold', rated_at: '2026-11-03', since_report: -0.01, return_12m: 0.08 }
        ] satisfies DigPeerRow[]
      ).filter((r) => r.is_company || r.cik !== cik),
      median: { operating_margin: 0.535, free_cash_flow_yield: 0.021, score: 75, since_report: 0.02, return_12m: 0.245 },
      recomputed_note: 'Scores recomputed from the report’s stored numbers.'
    },
    analysts: {
      state: 'ok',
      note: null,
      as_of: AS_OF,
      view: analysts('r-aapl-2'),
      ours: { bear: 190, base: 250, bull: 290, buy_trigger: 238, sell_trigger: 201 }
    },
    insiders: {
      state: 'ok',
      note: null,
      as_of: AS_OF,
      days: 183,
      buys: { trades: 1, people: 1, shares: 1000, value: 230000 },
      sells: { trades: 2, people: 2, shares: 30000, value: 6900000 },
      rows: [
        { owner: 'Pat Example', date: '2026-11-02', code: 'P', shares: 1000, price: 230 },
        { owner: 'Sam Sample', date: '2026-10-20', code: 'S', shares: 20000, price: 231 },
        { owner: 'Lee Demo', date: '2026-09-01', code: 'S', shares: 10000, price: null }
      ],
      routine_free_buyers: ['Pat Example']
    },
    news: {
      state: 'ok',
      note: null,
      as_of: AS_OF,
      since: '2026-11-05',
      items: [
        { title: 'Apple’s new chip gets an early look', publisher: 'Example Wire', published: '2026-11-16T13:30:00Z', url: 'https://www.reuters.com/technology/apple-chip-example', openable: true, tone: 'positive', tone_why: 'Reviewers liked the chip.' },
        { title: 'A supplier warns on orders', publisher: 'Not On The List', published: '2026-11-12T09:00:00Z', url: 'https://news.example.net/supplier', openable: false, tone: 'negative', tone_why: 'Fewer orders from Apple.' },
        { title: 'Five stocks to watch this week', publisher: 'Example Daily', published: '2026-11-10T20:15:00Z', url: 'https://www.fool.com/investing/2026/11/10/five-stocks', openable: true, tone: null, tone_why: null }
      ],
      tone: { positive: 1, neutral: 0, negative: 1, unknown: 1 },
      source: 'Massive'
    },
    sources: [
      { part: 'sector', name: 'Prices from Massive', state: 'ok', as_of: AS_OF },
      { part: 'market', name: 'Prices from Massive', state: 'ok', as_of: AS_OF },
      { part: 'rates', name: 'FRED', state: 'ok', as_of: AS_OF },
      { part: 'peers', name: 'The report’s stored numbers', state: 'ok', as_of: AS_OF },
      { part: 'analysts', name: 'analystdb', state: 'ok', as_of: AS_OF },
      { part: 'insiders', name: 'SEC Form 4 filings', state: 'ok', as_of: AS_OF },
      { part: 'news', name: 'Massive news', state: 'ok', as_of: AS_OF }
    ],
    ...changes
  }
}

export function digPage(cik = 320193, changes: Partial<DigPage> = {}): DigPage {
  return {
    cik,
    ticker: cik === 789019 ? 'MSFT' : 'AAPL',
    name: cik === 789019 ? 'Microsoft Corp' : 'Apple Inc.',
    has_report: true,
    snapshot: digSnapshot(cik),
    older: 0,
    refreshing: false,
    ...changes
  }
}
