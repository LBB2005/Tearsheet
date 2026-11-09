// The safety check's state (moved from setup/steps.ts, first-run design item 30): each note from
// the engine, the check under way after a reload, the chip's minutes and what it shows.

import { describe, expect, it } from 'vitest'

import type { LockdownState } from '../../../shared/protocol'
import type { ToolStatus } from '../../../shared/tools'
import { applySafetyNote, checksPassed, safetyFromRunning, safetyMinutes, safetyPassedFor, safetyStarted, safetyView, type SafetyState } from './safety'

const claude = (over: Partial<ToolStatus> = {}): ToolStatus => ({
  kind: 'claude',
  name: 'Claude Code',
  path: '/Users/me/.local/bin/claude',
  available: true,
  version: '2.1.317 (Claude Code)',
  loggedIn: true,
  reason: null,
  state: 'ready',
  plan: 'max',
  email: 'me@example.com',
  ...over
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

  it('starts at 0 of 25, from now', () => {
    expect(safetyStarted('claude', 1000)).toEqual({ tool: 'claude', n: 0, total: 25, done: false, passed: false, stopped: false, reason: null, stopping: false, startedAt: 1000 })
  })

  it('follows each call, then the end', () => {
    let s: SafetyState | null = safetyStarted('claude', 1000)
    s = applySafetyNote(s, 'safety_progress', progress(7))
    expect(s).toMatchObject({ n: 7, total: 25, done: false, startedAt: 1000 })
    s = applySafetyNote(s, 'safety_done', { tool: 'claude', passed: true, reason: null })
    expect(s).toEqual({ tool: 'claude', n: 25, total: 25, done: true, passed: true, stopped: false, reason: null, stopping: false, startedAt: 1000 })
  })

  it('keeps the count and the reason when the check fails', () => {
    let s = applySafetyNote(null, 'safety_progress', progress(12))
    s = applySafetyNote(s, 'safety_done', { tool: 'claude', passed: false, reason: '2 of 20 answers matched the schema', finished: true })
    expect(s).toEqual({ tool: 'claude', n: 12, total: 25, done: true, passed: false, stopped: false, reason: '2 of 20 answers matched the schema', stopping: false, startedAt: null })
  })

  it('marks a check the engine says didn’t finish as stopped, not failed', () => {
    let s = applySafetyNote(null, 'safety_progress', progress(12))
    s = applySafetyNote(s, 'safety_done', { tool: 'claude', passed: false, reason: 'The check couldn’t finish: usage limit', finished: false })
    expect(s).toEqual({ tool: 'claude', n: 12, total: 25, done: true, passed: false, stopped: true, reason: 'The check couldn’t finish: usage limit', stopping: false, startedAt: null })
  })

  it('keeps a stop asked for until the check ends, and only for the same check', () => {
    const stopping: SafetyState = { ...safetyStarted('claude', 1000), n: 4, stopping: true }
    expect(applySafetyNote(stopping, 'safety_progress', progress(5))).toMatchObject({ n: 5, stopping: true, startedAt: 1000 })
    // Another tool's check is a new one.
    expect(applySafetyNote(stopping, 'safety_progress', { ...progress(1), tool: 'codex' })).toMatchObject({ tool: 'codex', stopping: false, startedAt: null })
    expect(applySafetyNote(stopping, 'safety_done', { tool: 'claude', passed: false, reason: 'You stopped the safety check.', finished: false })).toMatchObject({ done: true, stopped: true, stopping: false })
  })

  it('ends a running check when the engine restarts, as stopped, and ignores other notes', () => {
    const running = applySafetyNote(null, 'safety_progress', progress(3))
    expect(applySafetyNote(running, 'engine_restarted', {})).toMatchObject({ n: 3, done: true, passed: false, stopped: true })
    expect(applySafetyNote(running, 'progress', { run_id: 'r1' })).toBe(running)
    expect(applySafetyNote(null, 'engine_restarted', {})).toBeNull()
  })
})

describe('safetyFromRunning', () => {
  const running = { tool: 'claude' as const, n: 8, total: 25, started_at: '2026-11-08T10:00:00+00:00' }
  const at = Date.parse('2026-11-08T10:00:00+00:00')

  it('starts the state from the check the settings say is under way', () => {
    expect(safetyFromRunning(null, running)).toEqual({ ...safetyStarted('claude', at), n: 8 })
    expect(safetyFromRunning(null, { ...running, started_at: 'soon' })).toMatchObject({ n: 8, startedAt: null })
  })

  it('keeps a note that came first, taking the further count and the start', () => {
    const noted = applySafetyNote(null, 'safety_progress', { tool: 'claude', n: 9, total: 25 })
    expect(safetyFromRunning(noted, running)).toMatchObject({ n: 9, startedAt: at })
    expect(safetyFromRunning({ ...safetyStarted('claude', 5), n: 2 }, running)).toMatchObject({ n: 8, startedAt: 5 })
  })

  it('leaves the state alone when no check runs', () => {
    const done: SafetyState = { ...safetyStarted('claude'), done: true, passed: true }
    expect(safetyFromRunning(done, null)).toBe(done)
    expect(safetyFromRunning(null, undefined)).toBeNull()
  })
})

describe('safetyMinutes', () => {
  it('says the minutes so far, under one at first, or nothing when the start isn’t known', () => {
    expect(safetyMinutes(0, 59_000)).toBe('under 1 min')
    expect(safetyMinutes(0, 60_000)).toBe('1 min')
    expect(safetyMinutes(0, 7 * 60_000 + 5)).toBe('7 min')
    expect(safetyMinutes(10_000, 0)).toBe('under 1 min')
    expect(safetyMinutes(null, 60_000)).toBeNull()
  })
})

describe('safetyView', () => {
  const run = (n: number): SafetyState => ({ tool: 'claude', n, total: 25, done: false, passed: false, stopped: false, reason: null, stopping: false, startedAt: 1000 })

  it('shows this session’s check for the tool being set up', () => {
    expect(safetyView(run(7), 'claude', false, null)).toEqual({ state: 'running', n: 7, total: 25, stopping: false, startedAt: 1000 })
    expect(safetyView({ ...run(7), stopping: true }, 'claude', false, null)).toMatchObject({ state: 'running', stopping: true })
    expect(safetyView({ ...run(25), done: true, passed: true }, 'claude', false, null)).toEqual({ state: 'passed' })
    expect(safetyView({ ...run(9), done: true, reason: 'No.' }, 'claude', false, null)).toEqual({ state: 'failed', reason: 'No.' })
  })

  it('shows a check that stopped part way as not finished, not as failed', () => {
    expect(safetyView({ ...run(9), done: true, stopped: true, reason: 'The check couldn’t finish: usage limit' }, 'claude', false, null)).toEqual({ state: 'unfinished', reason: 'The check couldn’t finish: usage limit' })
    expect(safetyView({ ...run(9), done: true, stopped: true, reason: null }, 'claude', false, null)).toEqual({ state: 'unfinished', reason: 'The check stopped before it finished.' })
  })

  it('counts a check that already passed, a check that didn’t start, and one about to start', () => {
    expect(safetyView(null, 'claude', true, null)).toEqual({ state: 'passed' })
    expect(safetyView(null, 'claude', false, 'A report is running.')).toEqual({ state: 'failed', reason: 'A report is running.' })
    expect(safetyView(null, 'claude', false, null)).toEqual({ state: 'running', n: 0, total: 25, stopping: false, startedAt: null })
    expect(safetyView({ ...run(4), tool: 'codex' }, 'claude', false, null)).toEqual({ state: 'running', n: 0, total: 25, stopping: false, startedAt: null })
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
