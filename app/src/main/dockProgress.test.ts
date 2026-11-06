import { describe, expect, it } from 'vitest'

import { dockUpdate, NO_RUN } from './dockProgress'

const progress = (run_id: string, step_name: string, state: string) => ({ method: 'progress', params: { run_id, step: 0, step_name, state } })

describe('dockUpdate', () => {
  it('shows a sliver of bar as soon as a run starts', () => {
    const u = dockUpdate(NO_RUN, progress('r1', 'resolve', 'started'))
    expect(u.bar).toBe(0.02)
    expect(u.run).toEqual({ runId: 'r1', states: { resolve: 'started' } })
  })

  it('fills the bar by steps done, out of 14', () => {
    let run = dockUpdate(NO_RUN, progress('r1', 'resolve', 'done')).run
    run = dockUpdate(run, progress('r1', 'fetch', 'started')).run
    const u = dockUpdate(run, progress('r1', 'fetch', 'done'))
    expect(u.bar).toBeCloseTo(2 / 14)
  })

  it('starts again for a new run, and counts a resumed run from where it picks up', () => {
    const old = dockUpdate(NO_RUN, progress('r1', 'news', 'done')).run
    const u = dockUpdate(old, progress('r2', 'narrate', 'started'))
    expect(u.run.runId).toBe('r2')
    expect(u.bar).toBeCloseTo(10 / 14)
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
