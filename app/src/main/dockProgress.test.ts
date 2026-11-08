import { describe, expect, it } from 'vitest'

import { USUAL } from '../shared/pace'
import { REPORT_STEPS } from '../shared/steps'
import { dockUpdate, NO_RUN } from './dockProgress'

const progress = (run_id: string, step_name: string, state: string) => ({ method: 'progress', params: { run_id, step: 0, step_name, state } })
const tally = (run_id: string, t: Record<string, unknown>) => ({ method: 'run_tally', params: { run_id, tally: t } })
const ALL = REPORT_STEPS.reduce((sum, s) => sum + USUAL[s], 0)
const T0 = 1_000_000
const sec = (s: number) => T0 + s * 1000

describe('dockUpdate', () => {
  it('shows a sliver of bar as soon as a run starts', () => {
    const u = dockUpdate(NO_RUN, progress('r1', 'resolve', 'started'), sec(0))
    expect(u.bar).toBe(0.02)
    expect(u.run).toMatchObject({ runId: 'r1', states: { resolve: 'started' } })
  })

  it('fills the bar by time, as the run view does, not by counting steps', () => {
    let run = dockUpdate(NO_RUN, progress('r1', 'resolve', 'done'), sec(1)).run
    run = dockUpdate(run, progress('r1', 'fetch', 'started'), sec(1)).run
    const u = dockUpdate(run, tally('r1', { companies: 9, fetching: 'facts', facts: 4 }), sec(51))
    expect(u.bar).toBeCloseTo((USUAL.resolve + 50) / ALL)
    expect(u.run.tally).toEqual({ companies: 9, fetching: 'facts', facts: 4 })
  })

  it('follows the AI calls the tally counts', () => {
    let run = dockUpdate(NO_RUN, progress('r1', 'news', 'done'), sec(112)).run
    run = dockUpdate(run, progress('r1', 'extract', 'started'), sec(112)).run
    const u = dockUpdate(run, tally('r1', { reads_done: 23, reads_total: 23, now: [] }), sec(200))
    const upToNarrate = REPORT_STEPS.slice(0, REPORT_STEPS.indexOf('narrate')).reduce((s, k) => s + USUAL[k], 0)
    expect(u.bar).toBeCloseTo(upToNarrate / ALL)
  })

  it('never moves the bar back', () => {
    let run = dockUpdate(NO_RUN, progress('r1', 'fetch', 'started'), sec(1)).run
    run = dockUpdate(run, tally('r1', { companies: 9 }), sec(80)).run
    const high = run.bar
    const u = dockUpdate(run, tally('r1', { companies: 9, typical: { fetch: 500 } }), sec(81))
    expect(u.bar).toBe(high)
  })

  it('starts again for a new run', () => {
    const old = dockUpdate(NO_RUN, progress('r1', 'news', 'done'), sec(0)).run
    const u = dockUpdate(old, progress('r2', 'resolve', 'started'), sec(1))
    expect(u.run.runId).toBe('r2')
    expect(u.bar).toBe(0.02)
  })

  it('takes the bar away and bounces once when the report is ready', () => {
    const run = dockUpdate(NO_RUN, progress('r1', 'save', 'started')).run
    expect(dockUpdate(run, { method: 'report_ready', params: { run_id: 'r1', report_id: 'x' } })).toEqual({ run: NO_RUN, bar: -1, bounce: true })
  })

  it('takes the bar away without a bounce when a run fails or the engine restarts', () => {
    const run = dockUpdate(NO_RUN, progress('r1', 'fetch', 'started')).run
    expect(dockUpdate(run, { method: 'run_failed', params: { run_id: 'r1' } })).toMatchObject({ bar: -1, bounce: false })
    expect(dockUpdate(run, { method: 'engine_restarted', params: {} })).toMatchObject({ bar: -1, bounce: false })
  })

  describe('for the line', () => {
    const line = (finished: number, writing: boolean, waiting: number, paused = false) => ({
      method: 'line_changed',
      params: {
        finished: Array.from({ length: finished }, () => ({})),
        writing: writing ? {} : null,
        waiting: Array.from({ length: waiting }, () => ({})),
        paused: paused ? { code: 'USAGE_LIMIT' } : null
      }
    })
    const ready = (run_id: string) => ({ method: 'report_ready', params: { run_id, report_id: 'x' } })

    it('fills the bar for the whole line, and keeps it between its reports', () => {
      let run = dockUpdate(NO_RUN, line(0, true, 3), sec(0)).run
      expect(run.line).toEqual({ done: 0, total: 4 })
      run = dockUpdate(run, progress('r1', 'resolve', 'started'), sec(0)).run
      expect(run.bar).toBe(0.02)
      const first = dockUpdate(run, ready('r1'))
      expect(first).toMatchObject({ bar: 0.25, bounce: false })
      run = dockUpdate(first.run, line(1, true, 2)).run
      const next = dockUpdate(run, progress('r2', 'resolve', 'started'), sec(1))
      expect(next.bar).toBe(0.25)
      expect(next.run.runId).toBe('r2')
      run = dockUpdate(next.run, progress('r2', 'resolve', 'done'), sec(2)).run
      run = dockUpdate(run, progress('r2', 'fetch', 'started'), sec(2)).run
      const half = dockUpdate(run, tally('r2', { companies: 9 }), sec(2 + ALL / 2))
      expect(half.bar).toBeGreaterThan(0.25)
      expect(half.bar).toBeLessThan(0.5)
    })

    it('bounces once, when the last report is ready', () => {
      let run = dockUpdate(NO_RUN, line(2, true, 0)).run
      run = dockUpdate(run, progress('r3', 'save', 'started')).run
      expect(dockUpdate(run, ready('r3'))).toEqual({ run: NO_RUN, bar: -1, bounce: true })
    })

    it('keeps the bar through a stopped report until the line says whether it pauses', () => {
      let run = dockUpdate(NO_RUN, line(0, true, 2)).run
      run = dockUpdate(run, progress('r1', 'narrate', 'started')).run
      const failed = dockUpdate(run, { method: 'run_failed', params: { run_id: 'r1' } })
      expect(failed).toMatchObject({ bar: null, bounce: false })
      expect(dockUpdate(failed.run, line(1, false, 2, true))).toEqual({ run: NO_RUN, bar: -1, bounce: false })
    })

    it('takes the bar away when the line is cleared, and leaves it alone when no line was going', () => {
      const run = dockUpdate(NO_RUN, line(0, true, 1)).run
      expect(dockUpdate(run, line(0, false, 0))).toMatchObject({ bar: -1 })
      expect(dockUpdate(NO_RUN, line(0, false, 0))).toEqual({ run: NO_RUN, bar: null, bounce: false })
    })
  })

  it('leaves the bar alone for other notifications', () => {
    const run = dockUpdate(NO_RUN, progress('r1', 'fetch', 'started')).run
    expect(dockUpdate(run, { method: 'hello', params: {} })).toEqual({ run, bar: null, bounce: false })
  })
})
