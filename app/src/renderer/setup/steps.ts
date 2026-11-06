// Pure logic for the first-time setup (the spec's "The first-time path"): which step to open
// at, the four-part progress line, the safety check's state, and the words that depend on the
// AI tool. The screens are in pages/Setup.tsx and the other files in this folder.

import type { ToolStatus } from '../../preload/api'
import type { LockdownState } from '../../shared/protocol'

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
  keys: Record<string, 'set' | 'missing'>
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

// Whether setup has been started: a key saved, FRED skipped, an email given, or an AI tool
// chosen. Finding Claude Code already on the Mac doesn't count, so a new person still sees the
// welcome screen.
export function hasProgress(s: { keys: Record<string, 'set' | 'missing'>; fred_skipped: boolean; sec_contact_email: string | null; primary_tool: string | null }): boolean {
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

// Whether text looks like an email address: something, @, a name, a dot and more, no spaces.
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// The version number in a tool's --version line: "2.1.317 (Claude Code)" gives "2.1.317".
export function versionNumber(v: string | null): string | null {
  if (v === null) return null
  return /\d+(?:\.\d+)+/.exec(v)?.[0] ?? v.trim()
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
  reason: string | null
}

export function safetyStarted(tool: ToolKind): SafetyState {
  return { tool, n: 0, total: SAFETY_CALLS, done: false, passed: false, reason: null }
}

const asTool = (v: unknown, fallback: ToolKind): ToolKind => (v === 'claude' || v === 'codex' ? v : fallback)
const asNumber = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function applySafetyNote(state: SafetyState | null, method: string, params: Record<string, unknown>): SafetyState | null {
  if (method === 'safety_progress') {
    const total = asNumber(params.total, state?.total ?? SAFETY_CALLS)
    return { tool: asTool(params.tool, state?.tool ?? 'claude'), n: asNumber(params.n, 0), total, done: false, passed: false, reason: null }
  }
  if (method === 'safety_done') {
    const total = state?.total ?? SAFETY_CALLS
    const passed = params.passed === true
    const reason = typeof params.reason === 'string' && params.reason ? params.reason : null
    return { tool: asTool(params.tool, state?.tool ?? 'claude'), n: passed ? total : (state?.n ?? 0), total, done: true, passed, reason }
  }
  // A restart ends the engine's check with it.
  if (method === 'engine_restarted' && state && !state.done) {
    return { ...state, done: true, passed: false, reason: 'Tearsheet’s engine stopped and restarted, so the check stopped too.' }
  }
  return state
}

export type SafetyView = { state: 'running'; n: number; total: number } | { state: 'passed' } | { state: 'failed'; reason: string }

// What the chip, the Connected screen and the ready list show for the tool being set up: this
// session's check, else a check that passed before for this version, else a check that couldn't
// start, else a check about to start.
export function safetyView(s: SafetyState | null, kind: ToolKind, alreadyPassed: boolean, startError: string | null): SafetyView {
  if (s && s.tool === kind) {
    if (!s.done) return { state: 'running', n: s.n, total: s.total }
    return s.passed ? { state: 'passed' } : { state: 'failed', reason: s.reason ?? 'The check did not pass.' }
  }
  if (alreadyPassed) return { state: 'passed' }
  if (startError) return { state: 'failed', reason: startError }
  return { state: 'running', n: 0, total: SAFETY_CALLS }
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
// different messages; anything else shows the engine's own message.
export function keyProblem(service: KeyService, code: string | undefined, message: string | undefined): string {
  const name = SERVICE_NAME[service]
  if (code === 'KEY_REJECTED') return `${name} didn’t accept that key. Check that you copied all of it.`
  if (code === 'SERVICE_UNREACHABLE') return `Couldn’t reach ${name} just now. Try again in a minute.`
  return message || 'The check didn’t finish. Try again in a minute.'
}
