import { describe, expect, it } from 'vitest'

import type { ReportNumbers } from '../../shared/protocol'
import { currentNumbers } from './useReportNumbers'

const numbers = (report_id: string): ReportNumbers => ({
  report_id,
  ticker: 'EXM',
  score_readout: null,
  factors: null,
  metrics: null,
  methods: null,
  price: null,
  estimate: null,
  range: null,
  returns: null,
  red_flags: null,
  red_flags_readout: null,
  economy: null,
  peer_ratings: null,
  claims: null,
  tables: []
})

describe('currentNumbers', () => {
  it('never shows another report’s numbers', () => {
    expect(currentNumbers({ reportId: 'rep-old', numbers: numbers('rep-old') }, 'rep-new')).toBeNull()
    expect(currentNumbers({ reportId: 'rep-old', numbers: numbers('rep-old') }, null)).toBeNull()
  })

  it('shows nothing before a load', () => {
    expect(currentNumbers(null, 'rep-new')).toBeNull()
  })

  it('shows this report’s numbers', () => {
    const mine = numbers('rep-new')
    expect(currentNumbers({ reportId: 'rep-new', numbers: mine }, 'rep-new')).toBe(mine)
  })
})
