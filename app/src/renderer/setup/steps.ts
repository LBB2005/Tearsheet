// Pure logic for the first-time setup (the spec's "The first-time path"): which step to open
// at, the four-part progress line, the safety check's state, and the words that depend on the
// AI tool. The screens are in pages/Setup.tsx and the other files in this folder.

import type { ToolStatus } from '../../preload/api'
import type { Keys, LockdownState, SafetyRunning } from '../../shared/protocol'
import { isEmail, versionNumber } from '../../shared/tools'

// The one-click install and sign-in (step 4's other version) is built but stays off until
// Anthropic approves it. While this is false, everyone sees the two Terminal steps.
export const ONE_CLICK_ENABLED = false

export type SetupStep = 'welcome' | 'connect' | 'find' | 'install' | 'connected' | 'prices' | 'fred' | 'email' | 'ready' | 'done'

export type ToolKind = 'claude' | 'codex'

export type KeyService = 'massive' | 'fred'

// The order of the nine screens. 'done' is not a screen: setup is finished.
export const STEP_ORDER: SetupStep[] = ['welcome', 'connect', 'find', 'install', 'connected', 'prices', 'fred', 'email', 'ready']

// The steps from "Connected" on, where the safety check runs and its chip can show.
export const AFTER_CONNECT: ReadonlySet<SetupStep> = new Set<SetupStep>(['connected', 'prices', 'fred', 'email', 'ready'])

export interface ResumeInput {
  setupDone: boolean
  // The AI tool being set up (the primary tool, or Claude Code), as the probe found it.
  tool: ToolStatus | undefined
  keys: Keys
  fredSkipped: boolean
  email: string | null
  // Whether anything in setup has been done yet (hasProgress).
  anyProgress: boolean
}

// Where setup opens: the first step that isn't done. The rules apply in this order.
export function resumeStep(s: ResumeInput): SetupStep {
  if (s.setupDone) return 'done'
  if (!s.anyProgress) return 'welcome'
  if (!s.tool || !s.tool.available) return 'find'
  // Sign-in comes only from the tool's own status command; unknown is not signed in.
  if (s.tool.loggedIn !== true) return 'install'
  if (s.keys.massive !== 'set') return 'prices'
  if (s.keys.fred !== 'set' && !s.fredSkipped) return 'fred'
  if (!isEmail(s.email ?? '')) return 'email'
  return 'ready'
}

// The screen after `from`: the first later step that isn't done yet, so a key saved before
// is passed over. It always moves forward, even when `from` itself was left undone.
export function nextStep(from: SetupStep, s: Omit<ResumeInput, 'setupDone' | 'anyProgress'>): SetupStep {
  const at = STEP_ORDER.indexOf(from)
  const first = resumeStep({ ...s, setupDone: false, anyProgress: true })
  if (first === 'done' || at < 0 || at === STEP_ORDER.length - 1) return 'done'
  return STEP_ORDER.indexOf(first) > at ? first : STEP_ORDER[at + 1]
}

// The words on Connected's button, for the screen it goes to (a key saved before is passed over).
export function nextLabel(next: SetupStep): string {
  if (next === 'prices') return 'Next: prices'
  if (next === 'fred') return 'Next: economic figures'
  if (next === 'email') return 'Next: your email'
  return 'Continue'
}

// Whether setup has been started: a key saved, FRED skipped, an email given, or an AI tool
// chosen. Finding Claude Code already on the Mac doesn't count, so a new person still sees the
// welcome screen.
export function hasProgress(s: { keys: Keys; fred_skipped: boolean; sec_contact_email: string | null; primary_tool: string | null }): boolean {
  return s.keys.massive === 'set' || s.keys.fred === 'set' || s.fred_skipped || Boolean(s.sec_contact_email) || Boolean(s.primary_tool)
}

// The four parts of the progress line in the toolbar: Claude Code, Prices, Details, Ready.
// The first two screens show none.
export function progressSegment(step: SetupStep): 0 | 1 | 2 | 3 | null {
  switch (step) {
    case 'find':
    case 'install':
    case 'connected':
      return 0
    case 'prices':
      return 1
    case 'fred':
    case 'email':
      return 2
    case 'ready':
      return 3
    default:
      return null
  }
}

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

// What the chip, the Connected screen and the ready list show for the tool being set up: this
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

// ---------- words that depend on the tool ----------

export interface ToolText {
  name: string
  short: string
  plan: string
  maker: string
  install: string
  login: string
  needs: string
}

export const TOOL_TEXT: Record<ToolKind, ToolText> = {
  claude: {
    name: 'Claude Code',
    short: 'Claude',
    plan: 'Claude plan',
    maker: 'Anthropic',
    install: 'curl -fsSL https://claude.ai/install.sh | bash',
    login: 'claude auth login',
    needs: 'a paid Claude plan, like Pro or Max'
  },
  codex: {
    name: 'Codex',
    short: 'Codex',
    plan: 'ChatGPT plan',
    maker: 'OpenAI',
    install: 'npm install -g @openai/codex',
    login: 'codex login',
    needs: 'a paid ChatGPT plan, like Plus or Pro'
  }
}

export const checkText = (template: string, t: ToolText) => template.replace('{t}', t.short).replace('{p}', t.plan)

// ---------- the key checks ----------

export const SERVICE_NAME: Record<KeyService, string> = { massive: 'Massive', fred: 'FRED' }

// What a failed key check says. A rejected key and a service that can't be reached get two
// different messages; anything else gets a fixed one. The engine's own text is never shown, so
// the window can't show a key even if an error ever echoed one.
export function keyProblem(service: KeyService, code: string | undefined, _message?: string): string {
  const name = SERVICE_NAME[service]
  if (code === 'KEY_REJECTED') return `${name} didn’t accept that key. Check that you copied all of it.`
  if (code === 'SERVICE_UNREACHABLE') return `Couldn’t reach ${name} just now. Try again in a minute.`
  return 'Something went wrong checking the key. Try again.'
}
