import { describe, expect, it } from 'vitest'

import type { ReportSummary } from '../../shared/protocol'
import { flagClaimId, nextView, oneColumn, otherReports, renderOptions, reportChoice, reportSubtitle, shownSide, TWO_COLUMNS_MIN } from './view'

const NOW = new Date(2026, 10, 6, 12)

const summary = (report_id: string, created_at: string, cik: number | null = 1045810, rating: string | null = 'Hold'): ReportSummary => ({
  report_id,
  run_id: `run-${report_id}`,
  cik,
  ticker: cik === 1045810 ? 'NVDA' : 'AAPL',
  name: cik === 1045810 ? 'NVIDIA CORP' : 'Apple Inc.',
  created_at,
  rating,
  narrative_complete: true
})

describe('reportSubtitle', () => {
  it('gives the date and the claims kept', () => {
    expect(reportSubtitle('2026-11-05T22:25:18.528109+00:00', 41, NOW)).toBe('Report of Nov 5, 41 claims kept')
    expect(reportSubtitle('2026-11-05T22:25:18+00:00', 1, NOW)).toBe('Report of Nov 5, 1 claim kept')
    expect(reportSubtitle('2026-11-05T22:25:18+00:00', 0, NOW)).toBe('Report of Nov 5, 0 claims kept')
  })

  it('leaves the count out when it is not stored', () => {
    expect(reportSubtitle('2026-11-05T22:25:18+00:00', null, NOW)).toBe('Report of Nov 5')
  })

  it('adds the year for an older year', () => {
    expect(reportSubtitle('2025-03-02T10:00:00+00:00', 12, NOW)).toBe('Report of Mar 2, 2025, 12 claims kept')
  })
})

describe('otherReports', () => {
  const list = [
    summary('rep-a', '2026-11-05T19:55:10+00:00', 320193),
    summary('rep-new', '2026-11-05T22:25:18+00:00'),
    summary('rep-old', '2026-11-03T12:30:00+00:00'),
    summary('rep-mid', '2026-11-04T09:00:00+00:00'),
    summary('rep-none', '2026-11-04T09:00:00+00:00', null)
  ]

  it("lists the same company's other reports, newest first", () => {
    expect(otherReports(list, 1045810, 'rep-new').map((r) => r.report_id)).toEqual(['rep-mid', 'rep-old'])
    expect(otherReports(list, 1045810, 'rep-old').map((r) => r.report_id)).toEqual(['rep-new', 'rep-mid'])
  })

  it('is empty for a company with one report, or with no company known', () => {
    expect(otherReports(list, 320193, 'rep-a')).toEqual([])
    expect(otherReports(list, null, 'rep-none')).toEqual([])
  })
})

describe('reportChoice', () => {
  it('names a report by its date, with its rating', () => {
    expect(reportChoice(summary('rep-old', '2026-11-03T12:30:00+00:00'), NOW)).toEqual({ label: 'Report of Nov 3', note: 'Hold' })
    expect(reportChoice(summary('rep-old', '2026-11-03T12:30:00+00:00', 1045810, null), NOW)).toEqual({ label: 'Report of Nov 3', note: 'No rating' })
  })
})

describe('renderOptions', () => {
  it('asks for the layout that follows the frame, so the chart never reloads the report', () => {
    expect(renderOptions({ view: 'summary', side: 'text', wide: true, motion: true })).toEqual({ view: 'summary', column: 'auto', side: 'text', narrow: false, motion: true })
    expect(renderOptions({ view: 'full', side: 'numbers', wide: true, motion: false })).toEqual({ view: 'full', column: 'auto', side: 'numbers', narrow: false, motion: false })
  })

  it('asks for the key tiles in a narrow window', () => {
    expect(renderOptions({ view: 'summary', side: 'text', wide: false, motion: true })).toEqual({ view: 'summary', column: 'auto', side: 'text', narrow: true, motion: true })
  })
})

describe('oneColumn', () => {
  it('drops to one column under 860 px', () => {
    expect(TWO_COLUMNS_MIN).toBe(860)
    expect(oneColumn(859)).toBe(true)
    expect(oneColumn(860)).toBe(false)
  })
})

describe('shownSide', () => {
  it('shows the numbers frame only beside the chart, in one column, with Numbers picked, once it has loaded', () => {
    expect(shownSide('numbers', true, true, true)).toBe('numbers')
    // Picked before its frame has loaded: the text stays on show, never a blank frame.
    expect(shownSide('numbers', true, false, true)).toBe('text')
    // Two columns: the text frame shows both, so it stays.
    expect(shownSide('numbers', false, true, true)).toBe('text')
    expect(shownSide('text', true, true, true)).toBe('text')
  })

  it('goes back to the text once the switch is gone: the chart closed, or a narrow window', () => {
    expect(shownSide('numbers', true, true, false)).toBe('text')
  })
})

describe('nextView', () => {
  it('maps the menu commands to views', () => {
    expect(nextView('summary')).toBe('summary')
    expect(nextView('full')).toBe('full')
    expect(nextView('chart')).toBeNull()
    expect(nextView('new')).toBeNull()
  })
})

describe('flagClaimId', () => {
  it("is the report's id and the claim's, as flag_claim takes them", () => {
    expect(flagClaimId('rep-20261105T221611Z-535855', 'business.1')).toBe('rep-20261105T221611Z-535855:business.1')
  })
})
