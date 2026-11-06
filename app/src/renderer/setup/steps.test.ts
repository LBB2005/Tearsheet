import { describe, expect, it } from 'vitest'

import type { ToolStatus } from '../../preload/api'
import type { LockdownState } from '../../shared/protocol'
import {
  applySafetyNote,
  checksPassed,
  hasProgress,
  isEmail,
  keyProblem,
  nextStep,
  progressSegment,
  resumeStep,
  safetyPassedFor,
  safetyStarted,
  safetyView,
  versionNumber,
  type SafetyState,
  type SetupStep
} from './steps'

const claude = (over: Partial<ToolStatus> = {}): ToolStatus => ({
  kind: 'claude',
  name: 'Claude Code',
  path: '/Users/me/.local/bin/claude',
  available: true,
  version: '2.1.317 (Claude Code)',
  loggedIn: true,
  reason: null,
  ...over
})
const missing = claude({ path: null, available: false, version: null, loggedIn: null, reason: "claude wasn't found on your PATH." })

const BOTH = { massive: 'set', fred: 'set', alphavantage: 'missing' } as const
const NONE = { massive: 'missing', fred: 'missing', alphavantage: 'missing' } as const

// Everything done but `setup_done`: the state of Liam's own install.
const all = {
  setupDone: false,
  tool: claude(),
  keys: BOTH as Record<string, 'set' | 'missing'>,
  fredSkipped: false,
  email: 'you@example.com' as string | null,
  anyProgress: true
}

describe('resumeStep', () => {
  it('1. a finished setup gives done', () => {
    expect(resumeStep({ ...all, setupDone: true })).toBe('done')
  })

  it('2. no progress at all gives welcome', () => {
    expect(resumeStep({ ...all, tool: undefined, keys: NONE, email: null, anyProgress: false })).toBe('welcome')
  })

  it('3. no tool found gives find', () => {
    expect(resumeStep({ ...all, tool: undefined })).toBe('find')
    expect(resumeStep({ ...all, tool: missing })).toBe('find')
  })

  it('4. a tool found but not signed in gives install', () => {
    expect(resumeStep({ ...all, tool: claude({ loggedIn: false }) })).toBe('install')
    // An unknown sign-in status is not taken as signed in.
    expect(resumeStep({ ...all, tool: claude({ loggedIn: null }) })).toBe('install')
  })

  it('5. no Massive key gives prices', () => {
    expect(resumeStep({ ...all, keys: { ...BOTH, massive: 'missing' } })).toBe('prices')
  })

  it('6. no FRED key, and FRED not skipped, gives fred', () => {
    expect(resumeStep({ ...all, keys: { ...BOTH, fred: 'missing' } })).toBe('fred')
    expect(resumeStep({ ...all, keys: { ...BOTH, fred: 'missing' }, fredSkipped: true })).not.toBe('fred')
  })

  it('7. no email gives email', () => {
    expect(resumeStep({ ...all, email: null })).toBe('email')
    expect(resumeStep({ ...all, email: '' })).toBe('email')
    expect(resumeStep({ ...all, keys: { ...BOTH, fred: 'missing' }, fredSkipped: true, email: null })).toBe('email')
  })

  it('8. otherwise ready, as for an install with everything but setup_done', () => {
    expect(resumeStep(all)).toBe('ready')
    expect(resumeStep({ ...all, keys: { ...BOTH, fred: 'missing' }, fredSkipped: true })).toBe('ready')
  })

  it('takes the first rule that applies when several do', () => {
    const nothing = { setupDone: false, tool: undefined, keys: NONE, fredSkipped: false, email: null, anyProgress: false }
    expect(resumeStep({ ...nothing, setupDone: true })).toBe('done')
    expect(resumeStep(nothing)).toBe('welcome')
    expect(resumeStep({ ...nothing, anyProgress: true })).toBe('find')
    expect(resumeStep({ ...nothing, anyProgress: true, tool: claude({ loggedIn: false }) })).toBe('install')
    expect(resumeStep({ ...nothing, anyProgress: true, tool: claude() })).toBe('prices')
    expect(resumeStep({ ...nothing, anyProgress: true, tool: claude(), keys: { ...NONE, massive: 'set' } })).toBe('fred')
  })
})

describe('nextStep', () => {
  const fresh = { ...all, keys: NONE as Record<string, 'set' | 'missing'>, email: null }

  it('goes on to the first later step that isn’t done', () => {
    expect(nextStep('connected', fresh)).toBe('prices')
    expect(nextStep('prices', { ...fresh, keys: { ...NONE, massive: 'set' } })).toBe('fred')
    expect(nextStep('fred', { ...fresh, keys: { ...NONE, massive: 'set' }, fredSkipped: true })).toBe('email')
    expect(nextStep('email', all)).toBe('ready')
  })

  it('passes over later steps already done, as a key saved before', () => {
    expect(nextStep('connected', { ...fresh, keys: BOTH })).toBe('email')
    expect(nextStep('connected', all)).toBe('ready')
  })

  it('always moves forward, never back to an earlier step', () => {
    // Prices was left without a key: the next screen is still the one after it.
    expect(nextStep('prices', fresh)).toBe('fred')
    expect(nextStep('connected', { ...fresh, tool: undefined })).toBe('prices')
    expect(nextStep('ready', all)).toBe('done')
  })
})

describe('hasProgress', () => {
  const settings = { keys: NONE, fred_skipped: false, sec_contact_email: null, primary_tool: null }

  it('is false for a brand-new install', () => {
    expect(hasProgress(settings)).toBe(false)
  })

  it('is true once anything in setup has been done', () => {
    expect(hasProgress({ ...settings, keys: { ...NONE, massive: 'set' } })).toBe(true)
    expect(hasProgress({ ...settings, keys: { ...NONE, fred: 'set' } })).toBe(true)
    expect(hasProgress({ ...settings, fred_skipped: true })).toBe(true)
    expect(hasProgress({ ...settings, sec_contact_email: 'you@example.com' })).toBe(true)
    expect(hasProgress({ ...settings, primary_tool: 'claude' })).toBe(true)
  })
})

describe('progressSegment', () => {
  it('shows none before the tool step', () => {
    expect(progressSegment('welcome')).toBeNull()
    expect(progressSegment('connect')).toBeNull()
    expect(progressSegment('done')).toBeNull()
  })

  it('puts each later step in its part: Claude Code, Prices, Details, Ready', () => {
    const parts: [SetupStep, number][] = [
      ['find', 0],
      ['install', 0],
      ['connected', 0],
      ['prices', 1],
      ['fred', 2],
      ['email', 2],
      ['ready', 3]
    ]
    for (const [step, part] of parts) expect(progressSegment(step)).toBe(part)
  })
})

describe('isEmail', () => {
  it('accepts an address', () => {
    expect(isEmail('you@example.com')).toBe(true)
    expect(isEmail('  you@example.com ')).toBe(true)
  })

  it('refuses what is not one', () => {
    expect(isEmail('you@')).toBe(false)
    expect(isEmail('you@example')).toBe(false)
    expect(isEmail('you example.com')).toBe(false)
    expect(isEmail('')).toBe(false)
  })
})

describe('versionNumber', () => {
  it('takes the number out of a --version line', () => {
    expect(versionNumber('2.1.317 (Claude Code)')).toBe('2.1.317')
    expect(versionNumber('codex-cli 0.165.0')).toBe('0.165.0')
  })

  it('keeps a line with no number, and passes null through', () => {
    expect(versionNumber('dev build')).toBe('dev build')
    expect(versionNumber(null)).toBeNull()
  })
})

describe('safetyPassedFor', () => {
  const state = (over: Partial<LockdownState> = {}): LockdownState => ({
    version: '2.1.317 (Claude Code)',
    passed: true,
    form: 'full',
    checked_at: '2026-11-05T10:00:00+00:00',
    blocked_reason: null,
    ...over
  })

  it('is true when the check passed for the version found now', () => {
    expect(safetyPassedFor(claude(), state())).toBe(true)
    expect(safetyPassedFor(claude(), state({ version: '2.1.317' }))).toBe(true)
  })

  it('is false for another version, a failed or blocked check, or none', () => {
    expect(safetyPassedFor(claude(), state({ version: '2.1.300 (Claude Code)' }))).toBe(false)
    expect(safetyPassedFor(claude(), state({ passed: false }))).toBe(false)
    expect(safetyPassedFor(claude(), state({ blocked_reason: 'tool_use_attempt' }))).toBe(false)
    expect(safetyPassedFor(claude(), undefined)).toBe(false)
    expect(safetyPassedFor(undefined, state())).toBe(false)
    expect(safetyPassedFor(claude({ version: null }), state())).toBe(false)
  })
})

describe('applySafetyNote', () => {
  const progress = (n: number) => ({ tool: 'claude', n, total: 25, name: `probe ${n}`, ok: true })

  it('starts at 0 of 25', () => {
    expect(safetyStarted('claude')).toEqual({ tool: 'claude', n: 0, total: 25, done: false, passed: false, reason: null })
  })

  it('follows each call, then the end', () => {
    let s: SafetyState | null = safetyStarted('claude')
    s = applySafetyNote(s, 'safety_progress', progress(7))
    expect(s).toMatchObject({ n: 7, total: 25, done: false })
    s = applySafetyNote(s, 'safety_done', { tool: 'claude', passed: true, reason: null })
    expect(s).toEqual({ tool: 'claude', n: 25, total: 25, done: true, passed: true, reason: null })
  })

  it('keeps the count and the reason when the check fails', () => {
    let s = applySafetyNote(null, 'safety_progress', progress(12))
    s = applySafetyNote(s, 'safety_done', { tool: 'claude', passed: false, reason: 'The check couldn’t finish: usage limit' })
    expect(s).toEqual({ tool: 'claude', n: 12, total: 25, done: true, passed: false, reason: 'The check couldn’t finish: usage limit' })
  })

  it('ends a running check when the engine restarts, and ignores other notes', () => {
    const running = applySafetyNote(null, 'safety_progress', progress(3))
    expect(applySafetyNote(running, 'engine_restarted', {})).toMatchObject({ n: 3, done: true, passed: false })
    expect(applySafetyNote(running, 'progress', { run_id: 'r1' })).toBe(running)
    expect(applySafetyNote(null, 'engine_restarted', {})).toBeNull()
  })
})

describe('safetyView', () => {
  const run = (n: number): SafetyState => ({ tool: 'claude', n, total: 25, done: false, passed: false, reason: null })

  it('shows this session’s check for the tool being set up', () => {
    expect(safetyView(run(7), 'claude', false, null)).toEqual({ state: 'running', n: 7, total: 25 })
    expect(safetyView({ ...run(25), done: true, passed: true }, 'claude', false, null)).toEqual({ state: 'passed' })
    expect(safetyView({ ...run(9), done: true, reason: 'No.' }, 'claude', false, null)).toEqual({ state: 'failed', reason: 'No.' })
  })

  it('counts a check that already passed, a check that didn’t start, and one about to start', () => {
    expect(safetyView(null, 'claude', true, null)).toEqual({ state: 'passed' })
    expect(safetyView(null, 'claude', false, 'A report is running.')).toEqual({ state: 'failed', reason: 'A report is running.' })
    expect(safetyView(null, 'claude', false, null)).toEqual({ state: 'running', n: 0, total: 25 })
    expect(safetyView({ ...run(4), tool: 'codex' }, 'claude', false, null)).toEqual({ state: 'running', n: 0, total: 25 })
  })
})

describe('checksPassed', () => {
  it('ticks the six checks off as the 25 calls go by', () => {
    expect(checksPassed(0)).toBe(0)
    expect(checksPassed(4)).toBe(0)
    expect(checksPassed(5)).toBe(1)
    expect(checksPassed(14)).toBe(3)
    expect(checksPassed(24)).toBe(5)
    expect(checksPassed(25)).toBe(6)
  })
})

describe('keyProblem', () => {
  it('tells a rejected key from a service that can’t be reached', () => {
    expect(keyProblem('massive', 'KEY_REJECTED', 'x')).toBe('Massive didn’t accept that key. Check that you copied all of it.')
    expect(keyProblem('fred', 'KEY_REJECTED', 'x')).toBe('FRED didn’t accept that key. Check that you copied all of it.')
    expect(keyProblem('massive', 'SERVICE_UNREACHABLE', 'x')).toBe('Couldn’t reach Massive just now. Try again in a minute.')
  })

  it('passes anything else through', () => {
    expect(keyProblem('fred', 'ENGINE_ERROR', 'Something broke.')).toBe('Something broke.')
    expect(keyProblem('fred', undefined, undefined)).toBe('The check didn’t finish. Try again in a minute.')
  })
})
