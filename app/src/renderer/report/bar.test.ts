import { readFileSync } from 'node:fs'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { CompanyRow, ReportBar } from '../../shared/protocol'
import { dayMove, DROPS, fitLevel, gap, LEVELS, listBar, ordinal, peersNote, rangeMarks, ratingNote, shows } from './bar'
import { BarLine } from './ReportBar'

// Nvidia's report of Nov 5, with the close of Nov 6 (the stored numbers).
const NVDA: ReportBar = {
  close: 186.64,
  close_date: '2026-11-06',
  previous_close: 183.23,
  rating: 'Hold',
  capped: true,
  red_flags: ['Risk-factor change'],
  range: { bear: 130.16, base: 233.7, bull: 419.62 },
  percentile: 74,
  peers: 40
}

const line = (bar: ReportBar, level: number) => renderToStaticMarkup(createElement(BarLine, { ticker: 'NVDA', name: 'NVIDIA CORP', bar, level, heading: true }))

describe('dayMove', () => {
  it('gives the move from the close before in dollars and %', () => {
    expect(dayMove(186.64, 183.23)).toEqual({ dollars: '+$3.41', percent: '+1.9%', dir: 'up' })
    expect(dayMove(342.37, 344.0425)).toEqual({ dollars: '−$1.67', percent: '−0.5%', dir: 'down' })
  })

  it('calls under half a cent no move', () => {
    expect(dayMove(100, 100.004)).toEqual({ dollars: '$0.00', percent: '0.0%', dir: 'flat' })
  })

  it('has nothing to say without both closes', () => {
    expect(dayMove(186.64, null)).toBeNull()
    expect(dayMove(null, 183.23)).toBeNull()
    expect(dayMove(186.64, 0)).toBeNull()
  })
})

describe('gap and ordinal', () => {
  it('puts the base case against the last close', () => {
    expect(gap(233.7, 186.64)).toEqual({ text: '+25.2%', dir: 'up' })
    expect(gap(394.02, 449.04)).toEqual({ text: '−12.3%', dir: 'down' })
    expect(gap(100, 0)).toBeNull()
  })

  it('writes percentiles as people say them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 74, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '74th', '101st', '111th'])
  })
})

describe('rangeMarks', () => {
  it('places the marks between the bear and bull ends', () => {
    const m = rangeMarks(NVDA.range!, 186.64)
    expect(m.bear).toBe(0)
    expect(m.bull).toBe(1)
    expect(m.close).toBeCloseTo((186.64 - 130.16) / (419.62 - 130.16))
    expect(m.base).toBeGreaterThan(m.close)
  })

  it('widens the scale for a close outside the range', () => {
    const below = rangeMarks({ bear: 100, base: 150, bull: 200 }, 50)
    expect(below.close).toBe(0)
    expect(below.bear).toBeCloseTo(1 / 3)
    const above = rangeMarks({ bear: 100, base: 150, bull: 200 }, 250)
    expect(above.close).toBe(1)
    expect(above.bull).toBeCloseTo(2 / 3)
  })
})

describe('the notes on pointing at a part', () => {
  it('names the red flag behind a capped Hold', () => {
    expect(ratingNote(NVDA)).toBe('Capped at Hold by a red flag: risk-factor change')
    expect(ratingNote({ ...NVDA, capped: false, rating: 'Buy' })).toBe('Against its peer group over the next 12 months')
  })

  it('counts the peers when the group is known', () => {
    expect(peersNote(NVDA)).toBe('Scores in the 74th percentile of its 40 peers')
    expect(peersNote({ ...NVDA, peers: null })).toBe('Scores in the 74th percentile of its peer group')
  })
})

describe('fitting the bar to the toolbar', () => {
  it('drops parts in order, the rating and the day’s move last', () => {
    expect(DROPS).toEqual(['date', 'peers', 'range', 'dollars', 'capped', 'base', 'rating', 'move'])
    expect(LEVELS).toBe(9)
    expect(shows(0, 'date')).toBe(true)
    expect(shows(1, 'date')).toBe(false)
    expect(shows(1, 'peers')).toBe(true)
    expect(shows(6, 'base')).toBe(false)
    expect(shows(6, 'rating')).toBe(true)
    expect(shows(8, 'move')).toBe(false)
  })

  it('picks the fullest level that fits, and the last one when none does', () => {
    const widths = [900, 820, 700, 600, 540, 500, 420]
    expect(fitLevel(widths, 1000)).toBe(0)
    expect(fitLevel(widths, 820)).toBe(1)
    expect(fitLevel(widths, 819.5)).toBe(2)
    expect(fitLevel(widths, 300)).toBe(6)
    expect(fitLevel([], 300)).toBe(0)
  })

  it('rounds a fractional width up, so a part never pokes out by a pixel', () => {
    expect(fitLevel([820.2, 700], 820)).toBe(1)
  })
})

describe('the bar', () => {
  it('shows everything when there is room', () => {
    const html = line(NVDA, 0)
    expect(html).toContain('<h1 class="rbar-tk" title="NVIDIA CORP" aria-label="NVDA, NVIDIA CORP">NVDA</h1>')
    expect(html).toContain('$186.64')
    expect(html).toContain('+$3.41 (+1.9%)')
    expect(html).toContain('Nov 6 close')
    expect(html).toContain('<b>Hold</b><small>capped</small>')
    expect(html).toContain('$233.70')
    expect(html).toContain('+25.2%')
    expect(html).toContain('$130')
    expect(html).toContain('$420')
    expect(html).toContain('<b>74th</b>')
  })

  it('keeps the ticker, the price, the move in % and the rating while it can', () => {
    const html = line(NVDA, 6)
    expect(html).toContain('NVDA')
    expect(html).toContain('$186.64')
    expect(html).toContain('>+1.9%<')
    expect(html).toContain('<b>Hold</b>')
    for (const gone of ['+$3.41', 'Nov 6 close', 'capped', '$233.70', '$420', '74th']) expect(html).not.toContain(gone)
  })

  it('keeps the ticker and the price when there is next to no room, with no empty box', () => {
    const html = line(NVDA, LEVELS - 1)
    expect(html).toContain('NVDA')
    expect(html).toContain('$186.64')
    expect(html).not.toContain('rbar-mv')
    expect(html).not.toContain('rbar-box')
  })

  it('says what each part means when you point at it', () => {
    const html = line(NVDA, 0)
    expect(html).toContain('title="Close on Nov 6"')
    expect(html).toContain('title="Change from the close before, $183.23"')
    expect(html).toContain('title="Capped at Hold by a red flag: risk-factor change"')
    expect(html).toContain('title="12-month range: bear $130.16, base $233.70, bull $419.62. The dot is the last close."')
  })

  it('leaves out what it does not know', () => {
    const html = line({ ...NVDA, previous_close: null, range: null, percentile: null }, 0)
    expect(html).not.toContain('rbar-mv')
    expect(html).not.toContain('rbar-base')
    expect(html).not.toContain('rbar-rng')
    expect(html).not.toContain('rbar-peers')
    expect(html).toContain('<b>Hold</b>')
  })

  it('has no heading in the ruler’s hidden copies', () => {
    const html = renderToStaticMarkup(createElement(BarLine, { ticker: 'NVDA', name: 'NVIDIA CORP', bar: NVDA, level: 0 }))
    expect(html).not.toContain('<h1')
  })
})

describe('listBar', () => {
  const row: CompanyRow = { cik: 1045810, ticker: 'NVDA', name: 'NVIDIA CORP', report_id: 'rep-1', report_date: '2026-11-05', reports: 1, price: 186.64, price_date: '2026-11-06', created_at: '2026-11-05T14:00:00Z', report_ids: ['rep-1'], since_report: null, rating: 'Hold', official: false, sector: null, pinned: false }

  it('starts from the sidebar’s last close and the list’s rating while the report loads', () => {
    expect(listBar(row, 'Hold')).toEqual({ ...NVDA, previous_close: null, capped: false, red_flags: [], range: null, percentile: null, peers: null })
    expect(line(listBar(row, 'Hold'), 0)).toContain('$186.64')
  })

  it('ignores a rating it does not know, and works with no row at all', () => {
    expect(listBar(row, 'Strong buy').rating).toBeNull()
    expect(listBar(undefined, null).close).toBeNull()
  })
})

// The toolbar drags the window, and Chromium only lets a part take the pointer (and so show what
// it means) when it is no-drag. The ruler's hidden copies must not punch no-drag holes.
describe('the bar and the window drag', () => {
  const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8')

  it('lets the parts on show take the pointer', () => {
    expect(css).toMatch(/\.top \.rbar > \.rbar-line > \*, \.top \.rbar > \.rbar-line \.rbar-box > span \{ -webkit-app-region: no-drag; \}/)
    expect(css).toMatch(/\.top \.rdate \{[^}]*-webkit-app-region: no-drag/)
  })

  it('gives the ruler no drag rule of its own', () => {
    for (const rule of css.match(/[^}]*-webkit-app-region[^}]*\}/g) ?? []) expect(rule).not.toContain('rbar-ruler')
  })
})
