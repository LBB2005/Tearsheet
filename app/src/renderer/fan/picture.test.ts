import { describe, expect, it } from 'vitest'

import { stepsBehind } from '../../shared/steps'
import { fanPicture } from './picture'

describe('fanPicture', () => {
  it('starts with nothing drawn but already working', () => {
    expect(fanPicture({})).toEqual({ hist: 0, fan: 0, today: false, tips: false, locked: false, working: true, failed: false })
  })

  it('draws the price line through steps 1–7, a running step counting for a third', () => {
    const p = fanPicture({ resolve: 'done', fetch: 'started' })
    expect(p.hist).toBeCloseTo(1.35 / 7)
    expect(p.fan).toBe(0)
    expect(p.today).toBe(false)
  })

  it('drops in today’s price once the rating is done', () => {
    const p = fanPicture({ value: 'done', rate: 'done', news: 'started' })
    expect(p.hist).toBe(1)
    expect(p.today).toBe(true)
    expect(p.fan).toBeCloseTo(0.35 / 5)
  })

  it('counts every step before the furthest one, for a resumed run', () => {
    const p = fanPicture({ narrate: 'started' })
    expect(p.hist).toBe(1)
    expect(p.today).toBe(true)
    expect(p.fan).toBeCloseTo(2.35 / 5)
  })

  it('shows the path ends after step 13 and locks the brackets when ready', () => {
    expect(fanPicture({ verify: 'done', save: 'started' }).tips).toBe(true)
    expect(fanPicture({ save: 'started' }, { ready: true })).toEqual({ hist: 1, fan: 1, today: true, tips: true, locked: true, working: false, failed: false })
  })

  it('stops working and turns red when a step fails or the run stops', () => {
    expect(fanPicture({ extract: 'failed' })).toMatchObject({ failed: true, working: false })
    expect(fanPicture({ fetch: 'started' }, { failed: true })).toMatchObject({ failed: true, working: false })
  })
})

describe('stepsBehind', () => {
  it('counts steps done, and the steps before a running one', () => {
    expect(stepsBehind({})).toBe(0)
    expect(stepsBehind({ resolve: 'started' })).toBe(0)
    expect(stepsBehind({ resolve: 'done' })).toBe(1)
    expect(stepsBehind({ rate: 'started' })).toBe(7)
    expect(stepsBehind({ save: 'done' })).toBe(14)
  })
})
