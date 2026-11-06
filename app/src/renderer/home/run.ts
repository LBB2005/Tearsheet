// Pure logic for the run view (RunView.tsx): which step a run is on, the toolbar's title, each
// step's state in the list and the ring, and how far the Glass mark fills.

import { REPORT_STEPS, stepsBehind, type StepStates } from '../../shared/steps'

export interface RunFailure {
  message: string
  code: string
  resetAt?: string | null
  fix?: string | null
  // The step the engine says the run stopped at (run_failed's `step`), if it named one.
  step?: string | null
}

export interface RunState {
  runId: string
  // The company the engine resolved in step 1 (run_report's answer).
  ticker: string | null
  name: string | null
  steps: StepStates
  reportId: string | null
  failure: RunFailure | null
}

export const TOTAL = REPORT_STEPS.length

// The step the run is on (0–13), or 14 once the report is ready. A stopped run is at the step
// the engine names: after a usage limit the pipeline still fills in the numbers, checks and
// saves the report so far, so the furthest step done would say 14. A stopped run is never ready.
export function runStep(run: RunState, ready: boolean): number {
  if (run.failure) {
    const at = REPORT_STEPS.indexOf(run.failure.step as (typeof REPORT_STEPS)[number])
    if (at >= 0) return at
  } else if (ready && run.reportId) return TOTAL
  return Math.min(stepsBehind(run.steps), TOTAL - 1)
}

// The toolbar's title and subtitle while the run view shows.
export function runTitle(run: RunState, ready: boolean): { title: string; subtitle: string } {
  const title = run.name ?? run.ticker ?? 'New report'
  const k = runStep(run, ready)
  if (k === TOTAL) return { title, subtitle: 'The report is ready' }
  if (run.failure) return { title, subtitle: `Stopped at step ${k + 1} of ${TOTAL}` }
  return { title, subtitle: `Writing the report, step ${k + 1} of ${TOTAL}` }
}

// One step's state, for the step list and its segment of the ring: done (d), being worked on
// (now), stopped (x) or waiting (w). After a stop, the steps that ran on show as done, counted
// as stepsBehind counts them: every step before the furthest one heard from.
export function stepStatus(run: RunState, ready: boolean, j: number): { cls: 'd' | 'now' | 'x' | 'w'; text: string } {
  const k = runStep(run, ready)
  const state = run.steps[REPORT_STEPS[j]]
  const done = { cls: 'd' as const, text: state === 'skipped' ? 'Skipped' : 'Done' }
  if (j < k) return done
  if (j === k) return run.failure ? { cls: 'x', text: 'Stopped' } : { cls: 'now', text: state === 'retrying' ? 'Retrying' : 'Working' }
  if (run.failure && j < stepsBehind(run.steps)) return done
  return { cls: 'w', text: '' }
}

// How much of the Glass mark's price line is drawn (0–1): the steps behind the run, all of it
// once the report is ready, and for a stopped run only the steps before the stop.
export function markFill(run: RunState, ready: boolean): number {
  const k = runStep(run, ready)
  if (k === TOTAL) return 1
  if (run.failure) return k / TOTAL
  return stepsBehind(run.steps) / TOTAL
}

// What a start or a resume refused while past predictions are graded says.
export const GRADING_FIRST = 'Tearsheet is grading past predictions first. Try again in a few minutes.'

// What a start or a resume refused while a company's full price history downloads says.
export const HISTORY_FIRST = 'Tearsheet is downloading a price history for the chart. Try again in a minute.'

// Why a start or a resume was refused, as a plain line: grading or a history download first,
// another run (or a cancelled one still stopping), else the engine's own sentence.
export function refusal(code: string | undefined, message: string | undefined, stopping: boolean): string {
  if (code === 'GRADING_IN_PROGRESS') return GRADING_FIRST
  if (code === 'HISTORY_DOWNLOADING') return HISTORY_FIRST
  if (code === 'RUN_IN_PROGRESS') {
    return stopping ? 'The cancelled report is still stopping. Try again in a minute.' : 'A report is already running. You can start another when it finishes.'
  }
  return message || 'The report didn’t start.'
}
