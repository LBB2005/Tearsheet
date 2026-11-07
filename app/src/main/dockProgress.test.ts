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

  it('leaves the bar alone for other notifications', () => {
    const run = dockUpdate(NO_RUN, progress('r1', 'fetch', 'started')).run
    expect(dockUpdate(run, { method: 'hello', params: {} })).toEqual({ run, bar: null, bounce: false })
  })
})
