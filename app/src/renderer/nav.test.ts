import { describe, expect, it } from 'vitest'

import type { CompanyRow } from '../shared/protocol'
import { REPORT_STEPS } from '../shared/steps'
import { nextCompany, shortDate, statusLine } from './nav'

const row = (ticker: string): CompanyRow => ({
  cik: ticker.length,
  ticker,
  name: `${ticker} Inc.`,
  report_id: `r-${ticker}`,
  report_date: '2026-11-05',
  reports: 1,
  price: 100,
  price_date: '2026-11-05'
})

const LIST = [row('NVDA'), row('AAPL'), row('JPM')]

// The first `n` of the 14 report steps done, and the next one started.
function stepsDone(n: number): Record<string, string> {
  const states: Record<string, string> = {}
  REPORT_STEPS.forEach((step, i) => {
    if (i < n) states[step] = 'done'
    else if (i === n) states[step] = 'started'
  })
  return states
}

describe('nextCompany', () => {
  it('moves to the next and the previous company', () => {
    expect(nextCompany(LIST, 'NVDA', 1)).toBe('AAPL')
    expect(nextCompany(LIST, 'JPM', -1)).toBe('AAPL')
  })

  it('wraps around at both ends', () => {
    expect(nextCompany(LIST, 'JPM', 1)).toBe('NVDA')
    expect(nextCompany(LIST, 'NVDA', -1)).toBe('JPM')
  })

  it('gives nothing for an empty list', () => {
    expect(nextCompany([], null, 1)).toBeNull()
    expect(nextCompany([], 'NVDA', -1)).toBeNull()
  })

  it('starts at the first company going forward, and the last going back, with no current company', () => {
    expect(nextCompany(LIST, null, 1)).toBe('NVDA')
    expect(nextCompany(LIST, null, -1)).toBe('JPM')
  })

  it('treats a company not in the list as no current company', () => {
    expect(nextCompany(LIST, 'MSFT', 1)).toBe('NVDA')
    expect(nextCompany(LIST, 'MSFT', -1)).toBe('JPM')
  })

  it('stays on the only company', () => {
    expect(nextCompany([row('NVDA')], 'NVDA', 1)).toBe('NVDA')
    expect(nextCompany([row('NVDA')], 'NVDA', -1)).toBe('NVDA')
  })
})

describe('statusLine', () => {
  it('says the tool is ready when nothing is going on', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: false })).toEqual({ tone: 'ok', text: 'Claude Code ready' })
  })

  it('follows a run, counting the step it is on', () => {
    const line = statusLine({ run: { ticker: 'JPM', steps: stepsDone(8) }, tools: 'Claude Code', signedOut: false })
    expect(line.tone).toBe('run')
    expect(line.text).toBe('Writing JPM, step 9 of 14')
    expect(line.progress).toBeCloseTo(8.5 / 14)
  })

  it('starts a run at step 1 and never counts past 14', () => {
    expect(statusLine({ run: { ticker: 'JPM', steps: {} }, tools: 'Claude Code', signedOut: false }).text).toBe('Writing JPM, step 1 of 14')
    const last = statusLine({ run: { ticker: 'JPM', steps: stepsDone(14) }, tools: 'Claude Code', signedOut: false })
    expect(last.text).toBe('Writing JPM, step 14 of 14')
    expect(last.progress).toBeLessThanOrEqual(1)
  })

  it('counts the safety check', () => {
    const line = statusLine({ safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false })
    expect(line).toEqual({ tone: 'run', text: 'Safety check, 7 of 25', progress: 7 / 25 })
  })

  it('says when the tool is signed out', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: true })).toEqual({ tone: 'stop', text: 'Claude Code signed out' })
  })

  it('names the tool in use', () => {
    expect(statusLine({ tools: 'Codex', signedOut: false }).text).toBe('Codex ready')
  })

  it('puts a run before the safety check, and the safety check before ready', () => {
    const both = statusLine({ run: { ticker: 'JPM', steps: stepsDone(8) }, safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false })
    expect(both.text).toBe('Writing JPM, step 9 of 14')
    expect(statusLine({ run: null, safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false }).text).toBe('Safety check, 7 of 25')
    expect(statusLine({ run: null, safety: null, tools: 'Claude Code', signedOut: false }).text).toBe('Claude Code ready')
  })

  it('puts a sign-out first, in red, as the setup prototype does', () => {
    const line = statusLine({ run: { ticker: 'JPM', steps: stepsDone(8) }, safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: true })
    expect(line).toEqual({ tone: 'stop', text: 'Claude Code signed out' })
  })
})

describe('shortDate', () => {
  const now = new Date(2026, 10, 6)

  it('gives the month and day for a date this year', () => {
    expect(shortDate('2026-11-05', now)).toBe('Nov 5')
  })

  it('adds the year for another year', () => {
    expect(shortDate('2025-11-05', now)).toBe('Nov 5, 2025')
  })

  it('reads the date as a calendar day, not a UTC moment', () => {
    expect(shortDate('2026-01-01', now)).toBe('Jan 1')
  })

  it('passes anything else through', () => {
    expect(shortDate('soon', now)).toBe('soon')
  })
})
