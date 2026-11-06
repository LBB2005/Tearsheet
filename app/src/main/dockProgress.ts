// The Dock icon's progress bar while a report runs (macOS draws the bar itself). Each engine
// notification gives the bar's new value: a share of the 14 steps, -1 to take the bar away, or
// null to leave it. When a report is ready the Dock icon bounces once, if the app is behind
// another one.

import { REPORT_STEPS, stepsBehind, type StepStates } from '../shared/steps'
import type { Notification } from './engine'

export interface DockRun {
  runId: string | null
  states: StepStates
}

export interface DockUpdate {
  run: DockRun
  bar: number | null
  bounce: boolean
}

export const NO_RUN: DockRun = { runId: null, states: {} }
// A sliver of bar as soon as a run starts, so it shows before the first step is done.
const FIRST = 0.02

export function dockUpdate(run: DockRun, note: Notification): DockUpdate {
  const p = note.params
  if (note.method === 'progress') {
    const runId = String(p.run_id)
    const states = { ...(runId === run.runId ? run.states : {}), [String(p.step_name)]: String(p.state) }
    return { run: { runId, states }, bar: Math.max(FIRST, stepsBehind(states) / REPORT_STEPS.length), bounce: false }
  }
  if (note.method === 'report_ready') return { run: NO_RUN, bar: -1, bounce: true }
  if (note.method === 'run_failed' || note.method === 'engine_restarted') return { run: NO_RUN, bar: -1, bounce: false }
  return { run, bar: null, bounce: false }
}
