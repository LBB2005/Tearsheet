// The Dock icon's progress bar while a report runs (macOS draws the bar itself). Each engine
// notification gives the bar's new value: how far the run has got paced by time (shared/pace.ts,
// as the run view and the sidebar do), -1 to take the bar away, or null to leave it. The bar
// never goes back. When a report is ready the Dock icon bounces once, if the app is behind
// another one.

import { noteStep, pace, type StepTimes } from '../shared/pace'
import type { Tally } from '../shared/protocol'
import type { StepStates } from '../shared/steps'
import type { Notification } from './engine'

export interface DockRun {
  runId: string | null
  states: StepStates
  times: StepTimes
  tally: Tally | null
  seen: Record<string, number>
  bar: number
}

export interface DockUpdate {
  run: DockRun
  bar: number | null
  bounce: boolean
}

export const NO_RUN: DockRun = { runId: null, states: {}, times: {}, tally: null, seen: {}, bar: 0 }
// A sliver of bar as soon as a run starts, so it shows before the first step is done.
const FIRST = 0.02

export function dockUpdate(run: DockRun, note: Notification, now: number = Date.now()): DockUpdate {
  const p = note.params
  if (note.method === 'progress' || note.method === 'run_tally') {
    const runId = String(p.run_id)
    let next: DockRun = runId === run.runId ? run : { ...NO_RUN, runId }
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
    const bar = Math.max(next.bar, FIRST, pace(next.states, next.times, next.tally, now, next.seen).progress)
    return { run: { ...next, bar }, bar, bounce: false }
  }
  if (note.method === 'report_ready') return { run: NO_RUN, bar: -1, bounce: true }
  if (note.method === 'run_failed' || note.method === 'engine_restarted') return { run: NO_RUN, bar: -1, bounce: false }
  return { run, bar: null, bounce: false }
}
