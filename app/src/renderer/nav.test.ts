import { describe, expect, it } from 'vitest'

import type { CompanyRow, SearchHit } from '../shared/protocol'
import type { LockdownState } from '../shared/protocol'
import { dayText, freshHits, nextCompany, peerRule, safetyFailed, safetyUnfinished, shortDate, statusLine } from './nav'
import { safetyStarted, type SafetyState } from './setup/state/safety'

const row = (ticker: string): CompanyRow => ({
  cik: ticker.length,
  ticker,
  name: `${ticker} Inc.`,
  report_id: `r-${ticker}`,
  report_date: '2026-11-05',
  reports: 1,
  price: 100,
  price_date: '2026-11-05',
  created_at: '2026-11-05T14:00:00Z',
  report_ids: [`r-${ticker}`],
  since_report: null,
  rating: null,
  official: false,
  sector: null,
  pinned: false
})

const LIST = [row('NVDA'), row('AAPL'), row('JPM')]

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

// A run 60% of the way, by time.
const JPM = { ticker: 'JPM', progress: 0.6, left: 'about 2 min left' }

describe('statusLine', () => {
  it('says the tool is ready when nothing is going on', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: false })).toEqual({ tone: 'ok', text: 'Claude Code ready' })
  })

  it('follows a run with its time left, and the bar paced by time', () => {
    const line = statusLine({ run: JPM, tools: 'Claude Code', signedOut: false })
    expect(line).toEqual({ tone: 'run', text: 'Writing JPM, about 2 min left', progress: 0.6 })
  })

  it('counts the safety check', () => {
    const line = statusLine({ safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false })
    expect(line).toEqual({ tone: 'run', text: 'Safety check, 7 of 25', progress: 7 / 25 })
  })

  it('says in red when the Massive key stopped working, after a sign-out and a failed check', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: false, keyRefused: true })).toEqual({ tone: 'stop', text: 'Massive key not accepted' })
    expect(statusLine({ tools: 'Claude Code', signedOut: true, keyRefused: true }).text).toBe('Claude Code signed out')
    expect(statusLine({ tools: 'Claude Code', signedOut: false, safetyFailed: true, keyRefused: true }).text).toBe('Safety check didn’t pass')
    expect(statusLine({ run: JPM, tools: 'Claude Code', signedOut: false, keyRefused: true }).text).toBe('Massive key not accepted')
  })

  it('says when the tool is signed out', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: true })).toEqual({ tone: 'stop', text: 'Claude Code signed out' })
  })

  it('names the tool in use', () => {
    expect(statusLine({ tools: 'Codex', signedOut: false }).text).toBe('Codex ready')
  })

  it('puts a run before the safety check, and the safety check before ready', () => {
    const both = statusLine({ run: JPM, safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false })
    expect(both.text).toBe('Writing JPM, about 2 min left')
    expect(statusLine({ run: null, safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false }).text).toBe('Safety check, 7 of 25')
    expect(statusLine({ run: null, safety: null, tools: 'Claude Code', signedOut: false }).text).toBe('Claude Code ready')
  })

  it('puts a sign-out first, in red, as the setup prototype does', () => {
    const line = statusLine({ run: JPM, safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: true })
    expect(line).toEqual({ tone: 'stop', text: 'Claude Code signed out' })
  })

  it('says in red when the safety check didn’t pass', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: false, safetyFailed: true })).toEqual({ tone: 'stop', text: 'Safety check didn’t pass' })
  })

  it('says when past predictions are being graded', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: false, grading: true })).toEqual({ tone: 'run', text: 'Grading past predictions' })
  })

  it('puts grading after a run and the safety check, and before ready', () => {
    expect(statusLine({ run: JPM, tools: 'Claude Code', signedOut: false, grading: true }).text).toBe('Writing JPM, about 2 min left')
    expect(statusLine({ safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false, grading: true }).text).toBe('Safety check, 7 of 25')
    expect(statusLine({ tools: 'Claude Code', signedOut: true, grading: true }).text).toBe('Claude Code signed out')
  })

  it('puts a failed safety check after a sign-out and before anything running', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: true, safetyFailed: true }).text).toBe('Claude Code signed out')
    const line = statusLine({ run: JPM, safety: { n: 7, total: 25 }, tools: 'Claude Code', signedOut: false, safetyFailed: true })
    expect(line.text).toBe('Safety check didn’t pass')
  })
})

describe('safetyFailed', () => {
  const stored = (over: Partial<LockdownState> = {}): LockdownState => ({ version: '2.1.317', passed: true, form: 'full', checked_at: '2026-11-05T19:00:00+00:00', blocked_reason: null, ...over })
  const finished = (passed: boolean): SafetyState => ({ ...safetyStarted('claude'), n: passed ? 25 : 9, done: true, passed, reason: passed ? null : 'It tried to use a tool.' })

  it('goes by this session’s check when it ran for the tool', () => {
    expect(safetyFailed(finished(false), 'claude', stored())).toBe(true)
    expect(safetyFailed(finished(true), 'claude', stored({ passed: false, blocked_reason: 'lockdown_failed' }))).toBe(false)
  })

  it('counts a check still running as not failed', () => {
    expect(safetyFailed(safetyStarted('claude'), 'claude', stored({ passed: false, blocked_reason: 'lockdown_failed' }))).toBe(false)
  })

  it('else goes by the last stored check', () => {
    expect(safetyFailed(null, 'claude', stored({ passed: false, blocked_reason: 'lockdown_failed' }))).toBe(true)
    expect(safetyFailed(null, 'claude', stored())).toBe(false)
    expect(safetyFailed(null, 'claude', undefined)).toBe(false)
  })

  it('ignores a check for the other tool', () => {
    expect(safetyFailed({ ...finished(false), tool: 'codex' }, 'claude', stored())).toBe(false)
  })

  it('doesn’t count a newer version or a one-off tool attempt as failed, since the engine checks those again itself', () => {
    expect(safetyFailed(null, 'claude', stored({ version: '2.0.1' }))).toBe(false)
    expect(safetyFailed(null, 'claude', stored({ passed: false, blocked_reason: 'tool_use_attempt' }))).toBe(false)
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

describe('freshHits', () => {
  const hit = (ticker: string): SearchHit => ({ ticker, name: ticker, sector: null, cik: ticker.length, report_id: null, report_date: null })
  const old = [hit('AAPL')]

  it('gives the hits only when they answer the text in the field now', () => {
    expect(freshHits('aapl', 'aapl', old)).toBe(old)
    expect(freshHits(' aapl ', 'aapl', old)).toBe(old)
  })

  it('gives none while the answer for newer text is on its way, so Return never picks an older hit', () => {
    expect(freshHits('jpm', 'aapl', old)).toEqual([])
    expect(freshHits('', '', old)).toEqual([])
  })
})

describe('a safety check that stopped part way', () => {
  const stored = (over: Partial<LockdownState> = {}): LockdownState => ({ version: '2.1.317', passed: true, form: 'full', checked_at: '2026-11-05T19:00:00+00:00', blocked_reason: null, ...over })
  const stopped: SafetyState = { ...safetyStarted('claude'), n: 9, done: true, passed: false, stopped: true, reason: 'The check couldn’t finish: usage limit' }

  it('is not a failure: the last stored check still counts', () => {
    expect(safetyFailed(stopped, 'claude', stored())).toBe(false)
    expect(safetyFailed(stopped, 'claude', undefined)).toBe(false)
    expect(safetyFailed(stopped, 'claude', stored({ passed: false, blocked_reason: 'lockdown_failed' }))).toBe(true)
  })

  it('shows as not finished, for this tool only', () => {
    expect(safetyUnfinished(stopped, 'claude')).toBe(true)
    expect(safetyUnfinished(stopped, 'codex')).toBe(false)
    expect(safetyUnfinished({ ...stopped, stopped: false }, 'claude')).toBe(false)
    expect(safetyUnfinished(null, 'claude')).toBe(false)
  })

  it('leaves the status line ready, not red', () => {
    expect(statusLine({ tools: 'Claude Code', signedOut: false, safetyFailed: safetyFailed(stopped, 'claude', stored()) })).toEqual({ tone: 'ok', text: 'Claude Code ready' })
  })
})

describe('peerRule', () => {
  const hit = (ticker: string, peer_rule?: string | null): SearchHit => ({ ticker, name: ticker, sector: 'Materials', cik: ticker.length, report_id: null, report_date: null, peer_rule })

  it('gives the engine’s peer-group rule for the highlighted company', () => {
    const hits = [hit('LIN', 'Compared with the other 23 S&P 500 Materials companies'), hit('SHW', 'Compared with the other 23 S&P 500 Materials companies, too')]
    expect(peerRule(hits, 0)).toBe('Compared with the other 23 S&P 500 Materials companies')
    expect(peerRule(hits, 1)).toBe('Compared with the other 23 S&P 500 Materials companies, too')
  })

  it('gives nothing with no highlighted company, or none from the engine', () => {
    expect(peerRule([], 0)).toBeNull()
    expect(peerRule([hit('LIN')], 0)).toBeNull()
    expect(peerRule([hit('LIN', null)], 3)).toBeNull()
  })
})

describe('dayText', () => {
  const now = new Date(2026, 10, 10)

  it('writes the engine’s "6 Nov 2026" the app’s way, month first', () => {
    expect(dayText('6 Nov 2026', now)).toBe('Nov 6')
    expect(dayText('1 Oct 2025', now)).toBe('Oct 1, 2025')
  })

  it('takes a stored date too, and leaves anything else as it is', () => {
    expect(dayText('2026-11-06', now)).toBe('Nov 6')
    expect(dayText('not stored', now)).toBe('not stored')
    expect(dayText('6 Foo 2026', now)).toBe('6 Foo 2026')
  })
})
