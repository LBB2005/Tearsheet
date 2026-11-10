// What the setup screen shows (first-run design item 31), worked out in one pure function from the
// three state machines: the three list rows with their words and actions, which question card is
// up (connect the AI, the price key, or the email and Start), whether Start can be pressed and
// why not, and where the focus goes. pages/Setup.tsx only connects events to it.

import { versionNumber, type ToolKind, type ToolState, type ToolStatus } from '../../shared/tools'
import { emailFixed, emailUsable, type EmailMachine } from './state/email'
import { safetyView, type SafetyState, type SafetyView } from './state/safety'
import { checkerOf, phaseOf, signInWait, waitsOnPaste, writerOf, type ToolMachine, type ToolPhase } from './state/tool'
import { dataSentence, emailHint, fixLabel, installTitle, progressWords, signedInAs, signingWords, stateSentence, TOOL_TEXT, waitTool, WORDS } from './words'

// The price key: none yet, one that worked here, or one saved before.
export type KeyState = 'missing' | 'works' | 'saved'

export interface ToolInput {
  machine: ToolMachine
  // "Can't tell" has lasted 2 minutes: the card shows what was found, with Try again and Show log.
  waitedLong: boolean
  // Why the main process won't run a tool's steps (main/toolSteps.ts), from commandsFor: a too-old
  // copy installed another way, or a program path set for a test.
  blocked: Partial<Record<ToolKind, string>>
}

export interface SafetyInput {
  state: SafetyState | null
  // A full check already passed for the writing tool's version.
  alreadyPassed: boolean
  startError: string | null
  // The go-ahead was given and a check was asked for.
  started: boolean
}

export interface FocusInput {
  // Get a free key was pressed, and the window has just come back.
  backFromMassive: boolean
  // The person focused something else meanwhile.
  elsewhere: boolean
}

export type RowTone = 'cur' | 'later' | 'done' | ''
export type RowIcon = 'done' | 'busy' | 'num'

export interface Connected {
  kind: ToolKind
  name: string
  // "Signed in as you@x.com, Claude Max · 2.1.317"
  account: string
  role: string | null
}

export type AiAction = 'stop_sign_in' | 'open_sign_in' | 'paste' | 'show_command'

export interface AiRow {
  tone: RowTone
  icon: RowIcon
  // A ready tool's lines (two when both tools are connected); else the words.
  connected: Connected[]
  words: string | null
  actions: AiAction[]
}

export interface KeyRow {
  tone: RowTone
  icon: RowIcon
  words: string
  actions: 'other_key'[]
}

export interface EmailRow {
  tone: RowTone
  icon: RowIcon
  words: string
  actions: 'change'[]
}

export type ConnectCard =
  // Neither tool is here: the three Install buttons, or the three paste commands.
  | { kind: 'pick'; mode: 'button' | 'paste' }
  | { kind: 'progress'; title: string; lines: string[] }
  // A state that isn't ready (CUJ 5): its sentence and its one button, if it has one.
  | { kind: 'fix'; tool: ToolKind; state: ToolPhase; sentence: string; button: string | null; mode: 'button' | 'paste' }
  | { kind: 'checking'; tool: ToolKind; sentence: string; long: boolean; found: ToolStatus | null; other: ToolKind | null }
  | { kind: 'failed'; reason: string; kinds: ToolKind[]; mode: 'button' | 'paste' }

export interface ScreenView {
  writer: ToolKind
  phase: ToolPhase
  rows: { ai: AiRow; key: KeyRow; email: EmailRow }
  card: 'connect' | 'key' | 'finish'
  connect: ConnectCard | null
  keyStep: string
  finish: { title: string; emailFixed: boolean; data: string }
  start: { enabled: boolean; reason: string }
  focus: 'key' | 'email' | null
  // The safety chip at the top right, once a check has been asked for or has passed before.
  chip: SafetyView | null
}

const CONNECT: ReadonlySet<ToolPhase> = new Set<ToolPhase>(['missing', 'installing', 'signed_out', 'too_old', 'api_key', 'free_plan', 'cant_tell', 'failed'])
const FIX: ReadonlySet<ToolPhase> = new Set<ToolPhase>(['signed_out', 'too_old', 'api_key', 'free_plan'])

function connectedLine(status: ToolStatus, role: string | null): Connected {
  const version = versionNumber(status.version)
  return { kind: status.kind, name: TOOL_TEXT[status.kind].name, account: version ? `${signedInAs(status)} · ${version}` : signedInAs(status), role }
}

export function screenView(tool: ToolInput, key: KeyState, email: EmailMachine, safety: SafetyInput, focus: FocusInput, buttonOn: boolean, news = false): ScreenView {
  const m = tool.machine
  const writer = writerOf(m)
  const W = TOOL_TEXT[writer]
  const phase = phaseOf(m)
  const status = m.tools?.find((t) => t.kind === writer) ?? null
  const checker = phase === 'ready' ? checkerOf(m) : null
  const pasted = waitsOnPaste(m)
  const mode = buttonOn && !m.refused ? 'button' : 'paste'
  const picked = m.picked ?? [writer]
  const blocked = tool.blocked[writer] ?? null
  const ready = phase === 'ready'
  const keyIn = key !== 'missing'
  const emailOk = emailUsable(email)
  const fixed = emailFixed(email)

  // Which card.
  const card: ScreenView['card'] = CONNECT.has(phase) && !pasted ? 'connect' : keyIn ? 'finish' : 'key'

  // The AI row.
  let words: string | null = null
  const actions: AiAction[] = []
  let connected: Connected[] = []
  if (ready && status) {
    const other = checker ? m.tools?.find((t) => t.kind === checker) : undefined
    connected = [connectedLine(status, other ? 'writes your reports' : null)]
    if (other) connected.push(connectedLine(other, 'checks each draft'))
  } else if (pasted) {
    words = `Waiting for ${W.name}`
    actions.push('show_command')
  } else if (phase === 'installing') {
    const last = m.progress[m.progress.length - 1]
    words = last ? progressWords(last) : installTitle(picked)
  } else if (phase === 'signing_in') {
    words = signingWords(picked)
    actions.push('stop_sign_in')
    const wait = signInWait(m)
    if (wait === 'slow' || wait === 'stuck') actions.push('open_sign_in')
    if (wait === 'stuck') actions.push('paste')
  } else if (phase === 'cant_tell') {
    words = 'Checking…'
  } else if (phase === 'failed') {
    words = m.failure
  } else if (phase === 'too_old' && blocked) {
    words = blocked
  } else {
    words = stateSentence(writer, phase as ToolState)
  }
  const busy = phase === 'installing' || phase === 'signing_in' || phase === 'cant_tell' || pasted
  const ai: AiRow = { tone: ready ? 'done' : card === 'connect' ? 'cur' : '', icon: ready ? 'done' : busy ? 'busy' : 'num', connected, words, actions }

  // The connect card.
  let connect: ConnectCard | null = null
  if (card === 'connect') {
    if (phase === 'missing') connect = { kind: 'pick', mode }
    else if (phase === 'installing') connect = { kind: 'progress', title: installTitle(picked), lines: m.progress.map(progressWords) }
    else if (phase === 'failed') connect = { kind: 'failed', reason: m.failure ?? '', kinds: picked, mode }
    else if (phase === 'cant_tell') {
      const otherKind: ToolKind = writer === 'claude' ? 'codex' : 'claude'
      const other = m.tools?.find((t) => t.kind === otherKind)?.state === 'ready' ? otherKind : null
      connect = { kind: 'checking', tool: writer, sentence: stateSentence(writer, 'cant_tell'), long: tool.waitedLong, found: status, other }
    } else if (FIX.has(phase)) {
      const state = phase as 'signed_out' | 'too_old' | 'api_key' | 'free_plan'
      const sentence = state === 'too_old' && blocked ? blocked : stateSentence(writer, state)
      const button = state === 'too_old' && blocked ? null : mode === 'button' ? fixLabel(writer, state) : WORDS.copyOpen
      connect = { kind: 'fix', tool: writer, state, sentence, button, mode }
    }
  }

  // The price key and email rows.
  const keyRow: KeyRow = {
    tone: keyIn ? 'done' : card === 'key' ? 'cur' : 'later',
    icon: keyIn ? 'done' : 'num',
    words: key === 'works' ? WORDS.keyRowWorks : key === 'saved' ? WORDS.keyRowSaved : WORDS.keyRowMissing,
    actions: keyIn ? ['other_key'] : []
  }
  const claudeFound = m.tools?.some((t) => t.kind === 'claude' && t.state !== 'missing') ?? true
  const anyFound = m.tools?.some((t) => t.state !== 'missing') ?? true
  let emailWords = emailHint(!anyFound ? 'none' : claudeFound && writer === 'claude' ? 'claude' : 'codex')
  if (fixed && email.state === 'suggested') emailWords = `${email.value}, from your Claude sign-in`
  else if (emailOk) emailWords = email.value
  // On the last question the email has its own Change (or its field), so the row has none.
  const emailRow: EmailRow = { tone: card === 'finish' ? 'cur' : emailOk ? 'done' : 'later', icon: emailOk ? 'done' : 'num', words: emailWords, actions: card !== 'finish' && (emailOk || email.value) ? ['change'] : [] }

  // Start.
  let reason: string = WORDS.readyNow
  if (!ready) reason = phase === 'missing' && !pasted ? 'Waiting for Claude Code or Codex' : waitTool(writer)
  else if (!keyIn) reason = WORDS.waitKey
  else if (!emailOk) reason = WORDS.addEmail
  const enabled = ready && keyIn && emailOk

  // Focus: back from massive.com onto the key field, if nothing else was focused; once the key
  // works, the email field, if it is empty or being changed.
  let to: ScreenView['focus'] = null
  if (card === 'key' && focus.backFromMassive && !focus.elsewhere) to = 'key'
  else if (card === 'finish' && !fixed && (!email.value.trim() || email.state === 'editing')) to = 'email'

  const chipShown = safety.started || safety.alreadyPassed || safety.startError !== null || (safety.state !== null && safety.state.tool === writer)
  const chip = chipShown ? safetyView(safety.state, writer, safety.alreadyPassed, safety.startError) : null

  return {
    writer,
    phase,
    rows: { ai, key: keyRow, email: emailRow },
    card,
    connect,
    keyStep: ready ? WORDS.keyStep : `While ${W.name} signs in`,
    finish: {
      title: fixed ? WORDS.finishReady : WORDS.finishEmail,
      emailFixed: fixed,
      data: dataSentence({ writer, checker, installed: m.installed, news })
    },
    start: { enabled, reason },
    focus: to,
    chip
  }
}
