// The Dock icon's progress bar while a report runs (macOS draws the bar itself). Each engine
// notification gives the bar's new value: how far the run has got paced by time (shared/pace.ts,
// as the run view and the sidebar do), -1 to take the bar away, or null to leave it. The bar
// never goes back. When a report is ready the Dock icon bounces once, if the app is behind
// another one.
//
// While the line writes several reports one after another (line_changed), the bar is the whole
// line's: 2 of 5 done and the third half-way is 50%. It stays between the line's reports, and the
// icon bounces once, when the last one is ready.

import { noteStep, pace, type StepTimes } from '../shared/pace'
import type { Tally } from '../shared/protocol'
import type { StepStates } from '../shared/steps'
import type { Notification } from './engine'

// The line's reports: those finished, and all of them (finished, being written and waiting).
export interface DockLine {
  done: number
  total: number
}

export interface DockRun {
  runId: string | null
  states: StepStates
  times: StepTimes
  tally: Tally | null
  seen: Record<string, number>
  bar: number
  line: DockLine | null
}

export interface DockUpdate {
  run: DockRun
  bar: number | null
  bounce: boolean
}

export const NO_RUN: DockRun = { runId: null, states: {}, times: {}, tally: null, seen: {}, bar: 0, line: null }
// A sliver of bar as soon as a run starts, so it shows before the first step is done.
const FIRST = 0.02

// The line from its note, or null when it has nothing more to write (done, paused or cleared).
function lineOf(params: Record<string, unknown>): DockLine | null {
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0)
  const finished = count(params.finished)
  const coming = (params.writing ? 1 : 0) + count(params.waiting)
  if (params.paused || coming === 0) return null
  return { done: finished, total: finished + coming }
}

// More of the line to come after the report being written.
const moreToCome = (line: DockLine | null) => line !== null && line.done + 1 < line.total

export function dockUpdate(run: DockRun, note: Notification, now: number = Date.now()): DockUpdate {
  const p = note.params
  if (note.method === 'progress' || note.method === 'run_tally') {
    const runId = String(p.run_id)
    // A new run starts afresh; in the line, the bar carries on from where the last one left it.
    let next: DockRun = runId === run.runId ? run : { ...NO_RUN, runId, line: run.line, bar: run.line ? run.bar : 0 }
    if (note.method === 'progress') {
      const step = String(p.step_name)
      const state = String(p.state)
      next = { ...next, states: { ...next.states, [step]: state }, times: noteStep(next.times, step, state, now) }
    } else {
      const tally = (p.tally ?? null) as Tally | null
      const seen = { ...next.seen }
      for (const name of tally?.now ?? []) if (seen[name] === undefined) seen[name] = now
      next = { ...next, tally, seen }
    }
    const own = pace(next.states, next.times, next.tally, now, next.seen).progress
    const share = next.line && next.line.total > 1 ? (next.line.done + own) / next.line.total : own
    const bar = Math.max(next.bar, FIRST, share)
    return { run: { ...next, bar }, bar, bounce: false }
  }
  if (note.method === 'line_changed') {
    const line = lineOf(p)
    // The line has stopped (paused, cleared or done) with no report of its own still going.
    if (line === null && run.line !== null) return { run: NO_RUN, bar: -1, bounce: false }
    return { run: { ...run, line }, bar: null, bounce: false }
  }
  if (note.method === 'report_ready') {
    if (moreToCome(run.line)) {
      const line = run.line as DockLine
      const bar = Math.max(run.bar, (line.done + 1) / line.total)
      return { run: { ...run, bar }, bar, bounce: false }
    }
    return { run: NO_RUN, bar: -1, bounce: true }
  }
  // A report in the line that stopped: the line says next whether it moves on or pauses.
  if (note.method === 'run_failed' && moreToCome(run.line)) return { run, bar: null, bounce: false }
  if (note.method === 'run_failed' || note.method === 'engine_restarted') return { run: NO_RUN, bar: -1, bounce: false }
  return { run, bar: null, bounce: false }
}
