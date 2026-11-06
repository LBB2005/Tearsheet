import { describe, expect, it } from 'vitest'

import { REPORT_STEPS } from '../../shared/steps'
import { GRADING_FIRST, HISTORY_FIRST, markFill, refusal, runStep, runTitle, stepStatus, type RunState } from './run'

// The first `n` steps done, and the next one started.
function stepsDone(n: number): Record<string, string> {
  const states: Record<string, string> = {}
  REPORT_STEPS.forEach((step, i) => {
    if (i < n) states[step] = 'done'
    else if (i === n) states[step] = 'started'
  })
  return states
}

const run = (over: Partial<RunState> = {}): RunState => ({ runId: 'run-1', ticker: 'JPM', name: 'JPMorgan Chase', steps: {}, reportId: null, failure: null, ...over })

// A usage limit during narrate: the pipeline still fills in the numbers, checks and saves the
// report so far (each step done), then the engine says the run stopped at narrate.
const usageLimit = (): RunState =>
  run({
    steps: stepsDone(14),
    reportId: 'rep-1',
    failure: { message: 'You’ve hit your limit.', code: 'USAGE_LIMIT', resetAt: null, fix: null, step: 'narrate' }
  })

describe('runStep', () => {
  it('counts the step being worked on, never past the last', () => {
    expect(runStep(run(), false)).toBe(0)
    expect(runStep(run({ steps: stepsDone(8) }), false)).toBe(8)
    expect(runStep(run({ steps: stepsDone(14) }), false)).toBe(13)
  })

  it('is past the last step once the report is ready', () => {
    expect(runStep(run({ steps: stepsDone(14), reportId: 'rep-1' }), true)).toBe(14)
  })

  it('puts a stopped run at the step the engine says it stopped at', () => {
    expect(runStep(usageLimit(), false)).toBe(REPORT_STEPS.indexOf('narrate'))
  })

  it('never shows a stopped run as ready, even with its report so far', () => {
    expect(runStep(usageLimit(), true)).toBe(REPORT_STEPS.indexOf('narrate'))
  })

  it('falls back to the furthest step when the engine names none', () => {
    const stopped = run({ steps: stepsDone(5), failure: { message: 'The engine stopped.', code: 'ENGINE_ERROR', step: null } })
    expect(runStep(stopped, false)).toBe(5)
  })
})

describe('runTitle', () => {
  it('names the company the engine resolved, with the step', () => {
    expect(runTitle(run({ steps: stepsDone(8) }), false)).toEqual({ title: 'JPMorgan Chase', subtitle: 'Writing the report, step 9 of 14' })
  })

  it('says where a stopped run stopped', () => {
    expect(runTitle(usageLimit(), true).subtitle).toBe('Stopped at step 11 of 14')
  })

  it('says when the report is ready', () => {
    expect(runTitle(run({ steps: stepsDone(14), reportId: 'rep-1' }), true).subtitle).toBe('The report is ready')
  })

  it('falls back to the ticker, then to New report', () => {
    expect(runTitle(run({ name: null }), false).title).toBe('JPM')
    expect(runTitle(run({ name: null, ticker: null }), false).title).toBe('New report')
  })
})

describe('stepStatus', () => {
  it('marks steps done, the one working, and the ones waiting', () => {
    const r = run({ steps: { ...stepsDone(9), news: 'skipped' } })
    expect(stepStatus(r, false, 0)).toEqual({ cls: 'd', text: 'Done' })
    expect(stepStatus(r, false, REPORT_STEPS.indexOf('news'))).toEqual({ cls: 'd', text: 'Skipped' })
    expect(stepStatus(r, false, 9)).toEqual({ cls: 'now', text: 'Working' })
    expect(stepStatus(r, false, 10)).toEqual({ cls: 'w', text: '' })
    expect(stepStatus(run({ steps: { ...stepsDone(9), extract: 'retrying' } }), false, 9).text).toBe('Retrying')
  })

  it('stops a stopped run at its step, and shows the steps that ran after it as done', () => {
    const r = usageLimit()
    const at = REPORT_STEPS.indexOf('narrate')
    expect(stepStatus(r, false, at - 1)).toEqual({ cls: 'd', text: 'Done' })
    expect(stepStatus(r, false, at)).toEqual({ cls: 'x', text: 'Stopped' })
    expect(stepStatus(r, false, REPORT_STEPS.indexOf('save'))).toEqual({ cls: 'd', text: 'Done' })
  })

  it('counts a step after the stop as done once a later one is, as the engine reports them', () => {
    // The engine's own notes after a usage limit: render is only heard to start, verify to end.
    const steps = { ...stepsDone(11), render: 'started', verify: 'done', save: 'done' }
    const r = run({ steps, reportId: 'rep-1', failure: { message: 'Limit.', code: 'USAGE_LIMIT', step: 'narrate' } })
    expect(stepStatus(r, false, REPORT_STEPS.indexOf('render'))).toEqual({ cls: 'd', text: 'Done' })
  })

  it('leaves steps after a stop waiting when they never ran', () => {
    const r = run({ steps: stepsDone(10), failure: { message: 'Signed out.', code: 'AUTH_EXPIRED', step: 'narrate' } })
    expect(stepStatus(r, false, REPORT_STEPS.indexOf('render'))).toEqual({ cls: 'w', text: '' })
  })
})

describe('markFill', () => {
  it('fills as the steps finish, and in full once the report is ready', () => {
    expect(markFill(run({ steps: stepsDone(7) }), false)).toBeCloseTo(7 / 14)
    expect(markFill(run({ steps: stepsDone(14), reportId: 'rep-1' }), true)).toBe(1)
  })

  it('fills a stopped run only up to where it stopped', () => {
    expect(markFill(usageLimit(), true)).toBeCloseTo(10 / 14)
  })
})

describe('refusal', () => {
  it('says plainly why a start or a resume was refused', () => {
    expect(refusal('GRADING_IN_PROGRESS', 'engine words', false)).toBe(GRADING_FIRST)
    expect(refusal('HISTORY_DOWNLOADING', 'engine words', false)).toBe(HISTORY_FIRST)
    expect(HISTORY_FIRST).toBe('Tearsheet is downloading a price history for the chart. Try again in a minute.')
  })

  it('tells a cancelled run still stopping apart from another run', () => {
    expect(refusal('RUN_IN_PROGRESS', 'x', true)).toBe('The cancelled report is still stopping. Try again in a minute.')
    expect(refusal('RUN_IN_PROGRESS', 'x', false)).toBe('A report is already running. You can start another when it finishes.')
  })

  it('gives the engine’s own sentence otherwise, or a fixed one', () => {
    expect(refusal('NOT_COVERED', 'Not in the S&P 500.', false)).toBe('Not in the S&P 500.')
    expect(refusal(undefined, undefined, false)).toBe('The report didn’t start.')
  })
})
