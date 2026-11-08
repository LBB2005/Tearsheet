// A report's numbers with everything stored, for the screen tests of the panel's bigger views.
// bridge.ts's numbers() is the other end: nothing stored but the ticker.

import type { ReportNumbers, ReturnRow, Slice } from '../../shared/protocol'
import { numbers } from './bridge'

const row = (name: string, value: number | null, readout = `${name} returned ${value ?? 'nothing'}`): ReturnRow => ({ name, value, readout })

const slice = (key: Slice['key'], label: string, count: number, items: string[] | null): Slice => ({ key, label, count, readout: `${count} ${label}`, items })

export function fullNumbers(reportId = 'r-aapl-2'): ReportNumbers {
  return {
    ...numbers(reportId),
    score_readout: 'Score 72 of 100, ahead of 72% of peers',
    factors: [
      { name: 'growth', percentile: 80, weight: 0.3, readout: 'Growth: ahead of 80% of peers' },
      { name: 'value', percentile: 35, weight: 0.4, readout: 'Value: ahead of 35% of peers' },
      { name: 'quality', percentile: 60, weight: 0.3, readout: 'Quality: ahead of 60% of peers' }
    ],
    metrics: [
      {
        name: 'pe',
        label: 'Price to earnings',
        value: 28,
        text: '28.0×',
        peer_median: 24,
        median_text: 'Peers: 24.0×',
        percentile: 30,
        peers: [
          { ticker: 'MSFT', value: 32, text: '32.0×', readout: 'MSFT: 32.0×' },
          { ticker: 'NVDA', value: 40, text: '40.0×', readout: 'NVDA: 40.0×' }
        ],
        readout: 'Price to earnings: 28.0×, peers 24.0×'
      },
      { name: 'margin', label: 'Operating margin', value: 30, text: '30.0%', peer_median: 25, median_text: 'Peers: 25.0%', percentile: 70, peers: [], readout: 'Operating margin: 30.0%' },
      { name: 'beta', label: 'Beta', value: 1.1, text: '1.1', peer_median: null, median_text: null, percentile: null, peers: [], readout: 'Beta: 1.1' }
    ],
    methods: [
      { method: 'dcf', label: 'Cash flow', value: 260, readout: 'Cash flow: $260.00 a share' },
      { method: 'multiples', label: 'Multiples', value: 235, readout: 'Multiples: $235.00 a share' }
    ],
    price: { value: 230.1, readout: 'Today: $230.10' },
    estimate: { value: 250, readout: 'Estimate: $250.00' },
    range: { bear: 190, base: 250, bull: 290, readout: '12-month range: $190.00 to $290.00' },
    returns: [
      { years: 1, company: row('Apple', 12.5), peers: row('Peers', 8), spy: row('S&P 500', 10), each_peer: [row('MSFT', 15), row('NVDA', -3), row('GOOG', null, 'GOOG: not stored')] },
      { years: 3, company: row('Apple', 40), peers: null, spy: row('S&P 500', 30), each_peer: [] }
    ],
    red_flags: [
      { code: 'going_concern', label: 'Going concern doubt', found: false, readout: 'No going-concern doubt found' },
      { code: 'restatement', label: 'Restated results', found: true, readout: 'Results were restated in 2024' }
    ],
    red_flags_readout: '1 of 2 checks found',
    economy: [
      { series: 'cpi', label: 'Inflation', value: '2.9%', date: 'Sep 2026', readout: 'Inflation was 2.9% in September' },
      { series: 'rate', label: 'Fed funds', value: '4.1%', date: 'Oct 2026', readout: 'Fed funds was 4.1% in October' }
    ],
    peer_ratings: { total: 38, slices: [slice('buy', 'Buy', 20, null), slice('hold', 'Hold', 15, null), slice('sell', 'Sell', 3, null)] },
    claims: { total: 41, slices: [slice('kept', 'Kept', 38, ['Revenue grew 6%', 'Margin held at 30%']), slice('removed', 'Removed', 3, [])] },
    tables: [
      { key: 'income', title: 'Income statement', rows: [['Line', 'FY2025', 'FY2024'], ['Revenue', '$400 billion', '$380 billion'], ['Net income', '$100 billion', '$95 billion'], ['Notes', 'n/a', '']] },
      { key: 'segments', title: 'Segments', rows: [] }
    ]
  }
}
