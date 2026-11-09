// The AI tool's side of the setup screen (first-run design item 30), as a pure reducer. Its
// states are the status read's seven (shared/tools.ts), each mapped to the state of the same
// name, and three from the Install button's install_progress messages: installing, signing_in
// and failed. It also holds which tools the person picked, so "Install both" knows its order and
// the writing tool is the first one picked.

import { FAILURES, type InstallProgress, type RunResult } from '../../../shared/install'
import { pickTool, type ToolKind, type ToolStatus } from '../../../shared/tools'

export type ToolPhase = 'missing' | 'installing' | 'signing_in' | 'signed_out' | 'too_old' | 'api_key' | 'free_plan' | 'cant_tell' | 'failed' | 'ready'

export interface ToolMachine {
  // The latest status read (tools_changed, or getTools), or null before the first one.
  tools: ToolStatus[] | null
  // The tools the person picked: an Install button, a fix for one tool, or a copied command.
  picked: ToolKind[] | null
  // The writing tool to use when nothing was picked: the saved primary_tool, or "Use Codex instead".
  chosen: ToolKind | null
  // Install was pressed and its answer (RunResult) isn't back yet.
  running: boolean
  // This run's install_progress messages, in order.
  progress: InstallProgress[]
  // Why the last run didn't work, from its failed or blocked message; null when nothing failed.
  failure: string | null
  // The tools whose installer ran from the button, for the data sentence.
  installed: ToolKind[]
  // The paste command was copied for these tools (the button off, or a fallback): the card moves
  // on to the price key while the person pastes it.
  copied: ToolKind[] | null
  // The main process refused the Install call (a fresh "off" from the online switch): the paste
  // command from now on (CUJ 10).
  refused: boolean
}

export type ToolEvent =
  | { type: 'tools'; tools: ToolStatus[] }
  | { type: 'pick'; kinds: ToolKind[] }
  | { type: 'progress'; progress: InstallProgress }
  | { type: 'result'; result: RunResult }
  | { type: 'copied'; kinds: ToolKind[] }
  | { type: 'use'; kind: ToolKind }
  | { type: 'retry' }

export function toolStart(chosen: ToolKind | null = null): ToolMachine {
  return { tools: null, picked: null, chosen, running: false, progress: [], failure: null, installed: [], copied: null, refused: false }
}

export function toolReducer(m: ToolMachine, e: ToolEvent): ToolMachine {
  switch (e.type) {
    case 'tools':
      return { ...m, tools: e.tools }
    case 'pick':
      return { ...m, picked: e.kinds, running: true, progress: [], failure: null, copied: null }
    case 'progress': {
      // A message from another run (Settings, or the home page's) isn't this screen's.
      if (!m.running || !(m.picked ?? []).includes(e.progress.tool)) return m
      const p = e.progress
      const installed = p.step === 'install' && p.status === 'downloading' && !m.installed.includes(p.tool) ? [...m.installed, p.tool] : m.installed
      const failure = p.status === 'failed' || p.status === 'blocked' ? (p.reason ?? (p.step === 'install' ? FAILURES.download : FAILURES.signIn)) : m.failure
      return { ...m, progress: [...m.progress, p], installed, failure }
    }
    case 'result': {
      if (!m.running) return m
      const r = e.result
      if (r.outcome === 'refused') return { ...m, running: false, refused: true, failure: null }
      const failure = r.outcome === 'failed' || r.outcome === 'blocked' ? (m.failure ?? FAILURES.signIn) : m.failure
      return { ...m, running: false, failure }
    }
    case 'copied':
      return { ...m, picked: e.kinds, copied: e.kinds, failure: null }
    case 'use':
      return { ...m, chosen: e.kind, picked: null, failure: null, copied: null }
    case 'retry':
      return { ...m, failure: null }
  }
}

const statusOf = (m: ToolMachine, kind: ToolKind) => m.tools?.find((t) => t.kind === kind)

// The tool that writes the reports: the first one picked; else the one chosen, when it is on this
// Mac; else pickTool's (the first ready one, Claude Code before Codex); else Claude Code.
export function writerOf(m: ToolMachine): ToolKind {
  if (m.picked?.length) return m.picked[0]
  const chosen = m.chosen ? statusOf(m, m.chosen) : undefined
  if (m.chosen && chosen && chosen.state !== 'missing') return m.chosen
  return pickTool(m.tools ?? [])?.kind ?? 'claude'
}

export function writerStatus(m: ToolMachine): ToolStatus | undefined {
  return statusOf(m, writerOf(m))
}

// The writing tool's state on the screen.
export function phaseOf(m: ToolMachine): ToolPhase {
  const status = writerStatus(m)
  if (m.running) {
    const last = m.progress[m.progress.length - 1]
    if (last?.status === 'failed' || last?.status === 'blocked') return 'failed'
    if (!last) return status && status.state !== 'missing' && status.state !== 'too_old' ? 'signing_in' : 'installing'
    return last.step === 'install' ? 'installing' : 'signing_in'
  }
  // A tool that reads ready is ready, however it got there (the paste command after a failure).
  if (status?.state === 'ready') return 'ready'
  if (m.failure) return 'failed'
  if (!m.tools) return 'cant_tell'
  return status?.state ?? 'missing'
}

// The checking tool: the other one, when it reads ready too.
export function checkerOf(m: ToolMachine): ToolKind | null {
  const other: ToolKind = writerOf(m) === 'claude' ? 'codex' : 'claude'
  return statusOf(m, other)?.state === 'ready' ? other : null
}

// The copied command is what the screen waits for: the writing tool's copy worked and it isn't
// ready yet.
export function waitsOnPaste(m: ToolMachine): boolean {
  return Boolean(m.copied?.includes(writerOf(m))) && !m.running && phaseOf(m) !== 'ready'
}

// The sign-in under way, and how long it has waited: slow after 15 seconds, stuck after 2 minutes.
export function signInWait(m: ToolMachine): 'waiting' | 'slow' | 'stuck' | null {
  if (!m.running) return null
  const last = m.progress[m.progress.length - 1]
  if (!last || last.step !== 'signIn') return null
  if (last.status === 'stuck') return 'stuck'
  if (last.status === 'slow') return 'slow'
  return last.status === 'opening_browser' ? 'waiting' : null
}
