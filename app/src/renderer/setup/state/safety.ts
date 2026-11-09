// The safety check's state in the window (the lock-down check, first-run design §5): this
// session's check from the engine's safety_progress and safety_done notes, what the chip shows,
// and the six things it makes sure of. Moved unchanged from the old setup/steps.ts (item 30).
// App keeps the state, so the sidebar's status line and the toolbar's chip follow the same check
// after setup.

import type { LockdownState, SafetyRunning } from '../../../shared/protocol'
import { versionNumber, type ToolKind, type ToolStatus } from '../../../shared/tools'

// Whether the tool's lock-down check (the safety check) has passed for the version found now.
// A newer version is checked again.
export function safetyPassedFor(tool: ToolStatus | undefined, state: LockdownState | undefined): boolean {
  if (!tool?.version || !state?.version) return false
  return state.passed && !state.blocked_reason && versionNumber(state.version) === versionNumber(tool.version)
}

// ---------- the safety check ----------

export const SAFETY_CALLS = 25

// This session's safety check, from the engine's safety_progress and safety_done notes. The
// sidebar's status line reads it too, so a check still running after setup keeps showing there.
export interface SafetyState {
  tool: ToolKind
  n: number
  total: number
  done: boolean
  passed: boolean
  // The check ended part way with no verdict: the engine restarted, the person stopped it, or a
  // usage limit, a sign-out or a crash stopped it (safety_done's finished: false). Not a failure.
  stopped: boolean
  reason: string | null
  // "Stop the check" was pressed: the call in progress ends, then the check stops (the engine's
  // cancel_safety_check). The chip says "Stopping after this call" meanwhile.
  stopping: boolean
  // When the check started (ms), for the chip's minutes so far; null when it isn't known.
  startedAt: number | null
}

export function safetyStarted(tool: ToolKind, at: number = Date.now()): SafetyState {
  return { tool, n: 0, total: SAFETY_CALLS, done: false, passed: false, stopped: false, reason: null, stopping: false, startedAt: at }
}

const asTool = (v: unknown, fallback: ToolKind): ToolKind => (v === 'claude' || v === 'codex' ? v : fallback)
const asNumber = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function applySafetyNote(state: SafetyState | null, method: string, params: Record<string, unknown>): SafetyState | null {
  if (method === 'safety_progress') {
    const tool = asTool(params.tool, state?.tool ?? 'claude')
    const total = asNumber(params.total, state?.total ?? SAFETY_CALLS)
    // The same check going on keeps its start and a stop already asked for.
    const same = state !== null && state.tool === tool && !state.done
    return { tool, n: asNumber(params.n, 0), total, done: false, passed: false, stopped: false, reason: null, stopping: same && state.stopping, startedAt: same ? state.startedAt : null }
  }
  if (method === 'safety_done') {
    const total = state?.total ?? SAFETY_CALLS
    const passed = params.passed === true
    const reason = typeof params.reason === 'string' && params.reason ? params.reason : null
    // Only a check that ran to the end and didn't pass is a failure.
    const stopped = !passed && params.finished === false
    return { tool: asTool(params.tool, state?.tool ?? 'claude'), n: passed ? total : (state?.n ?? 0), total, done: true, passed, stopped, reason, stopping: false, startedAt: state?.startedAt ?? null }
  }
  // A restart ends the engine's check with it, unfinished.
  if (method === 'engine_restarted' && state && !state.done) {
    return { ...state, done: true, passed: false, stopped: true, stopping: false, reason: 'Tearsheet’s engine stopped and restarted, so the check stopped too.' }
  }
  return state
}

// The check under way as the settings give it (safety_running), so a window that reloads
// mid-check shows the real count and the minutes so far. A note that came first keeps its count
// if it is further on, and takes the start.
export function safetyFromRunning(state: SafetyState | null, running: SafetyRunning | null | undefined): SafetyState | null {
  if (!running) return state
  const started = Date.parse(running.started_at)
  const at = Number.isNaN(started) ? null : started
  if (state && state.tool === running.tool && !state.done) return { ...state, n: Math.max(state.n, running.n), startedAt: state.startedAt ?? at }
  return { ...safetyStarted(running.tool, 0), n: running.n, total: running.total, startedAt: at }
}

// The minutes a check has run, for the chip: "under 1 min", then "1 min", "2 min"…
export function safetyMinutes(startedAt: number | null, now: number): string | null {
  if (startedAt === null) return null
  const m = Math.floor(Math.max(0, now - startedAt) / 60_000)
  return m < 1 ? 'under 1 min' : `${m} min`
}

export type SafetyView =
  | { state: 'running'; n: number; total: number; stopping: boolean; startedAt: number | null }
  | { state: 'passed' }
  | { state: 'failed'; reason: string }
  // Stopped part way, with no verdict: shown muted, with Run the check again.
  | { state: 'unfinished'; reason: string }

// What the chip shows for the tool being set up (setup's, and the toolbar's after setup): this
// session's check, else a check that passed before for this version, else a check that couldn't
// start, else a check about to start.
export function safetyView(s: SafetyState | null, kind: ToolKind, alreadyPassed: boolean, startError: string | null): SafetyView {
  if (s && s.tool === kind) {
    if (!s.done) return { state: 'running', n: s.n, total: s.total, stopping: s.stopping, startedAt: s.startedAt }
    if (s.passed) return { state: 'passed' }
    if (s.stopped) return { state: 'unfinished', reason: s.reason ?? 'The check stopped before it finished.' }
    return { state: 'failed', reason: s.reason ?? 'The check did not pass.' }
  }
  if (alreadyPassed) return { state: 'passed' }
  if (startError) return { state: 'failed', reason: startError }
  return { state: 'running', n: 0, total: SAFETY_CALLS, stopping: false, startedAt: null }
}

// The six things the safety check makes sure of, in plain words, and the call after which each
// one is ticked off. {t} is the tool's short name and {p} its plan.
export const SAFETY_CHECKS: [string, number][] = [
  ['{t} can’t run commands or use tools', 5],
  ['{t} can’t open your files, even when a test tells it to', 10],
  ['Your own {t} settings, plugins and tool servers stay off', 14],
  ['It runs on your {p}, not an API key', 18],
  ['Answers come back in the shape Tearsheet reads', 22],
  ['Web search is the only thing it may do, and only when Tearsheet asks', 25]
]

// How many of the six checks are ticked off after `n` calls.
export function checksPassed(n: number): number {
  return SAFETY_CHECKS.filter(([, after]) => n >= after).length
}
