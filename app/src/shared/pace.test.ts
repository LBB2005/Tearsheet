import { describe, expect, it } from 'vitest'

import { about, calls, clock, leftText, noteStep, pace, USUAL, usualTimes, type StepTimes } from './pace'
import type { Tally } from './protocol'
import { REPORT_STEPS } from './steps'

const T0 = 1_000_000
const sec = (s: number) => T0 + s * 1000
const ALL = REPORT_STEPS.reduce((sum, s) => sum + USUAL[s], 0)

// The first `n` steps done, the next started at `startedAt` seconds.
function upTo(n: number, startedAt = 0): { states: Record<string, string>; times: StepTimes } {
  const states: Record<string, string> = {}
  const times: StepTimes = {}
  REPORT_STEPS.forEach((step, i) => {
    if (i < n) states[step] = 'done'
    else if (i === n) {
      states[step] = 'started'
      times[step] = { started: sec(startedAt) }
    }
  })
  return { states, times }
}

describe('noteStep', () => {
  it('keeps the first start and the first finish of each step', () => {
    let t: StepTimes = {}
    t = noteStep(t, 'fetch', 'started', 1)
    t = noteStep(t, 'fetch', 'retrying', 2)
    t = noteStep(t, 'fetch', 'done', 3)
    t = noteStep(t, 'fetch', 'done', 4)
    expect(t).toEqual({ fetch: { started: 1, done: 3 } })
    // A step only heard to finish (or be skipped) started when it finished.
    expect(noteStep({}, 'news', 'skipped', 9)).toEqual({ news: { started: 9, done: 9 } })
    expect(noteStep(t, 'fetch', 'failed', 5)).toBe(t)
  })
})

describe('usualTimes', () => {
  it('takes the engine’s usual times, and this table for any it lacks', () => {
    expect(usualTimes(null)).toEqual(USUAL)
    const mixed = usualTimes({ typical: { fetch: 30, extract: Number.NaN, narrate: -1 } })
    expect(mixed.fetch).toBe(30)
    expect(mixed.extract).toBe(USUAL.extract)
    expect(mixed.narrate).toBe(USUAL.narrate)
  })
})

describe('calls', () => {
  it('reads a step’s AI calls done out of all from the tally', () => {
    const t: Tally = { reads_done: 5, reads_total: 23, sections_total: 6, checks_done: 1, checks_total: 0 }
    expect(calls(t, 'extract')).toEqual({ done: 5, total: 23 })
    expect(calls(t, 'narrate')).toEqual({ done: 0, total: 6 })
    expect(calls(t, 'verify')).toBeNull()
    expect(calls(t, 'fetch')).toBeNull()
    expect(calls(null, 'extract')).toBeNull()
  })
})

describe('pace', () => {
  it('starts at nothing done, with the whole usual time left', () => {
    const p = pace({}, {}, null, sec(0))
    expect(p.progress).toBe(0)
    expect(p.left).toBeCloseTo(ALL)
  })

  it('moves through a long step with time, instead of jumping by steps', () => {
    const { states, times } = upTo(1, 1)
    const at = (s: number) => pace(states, times, null, sec(s))
    expect(at(1).progress).toBeCloseTo(USUAL.resolve / ALL)
    expect(at(51).progress).toBeCloseTo((USUAL.resolve + 50) / ALL)
    expect(at(51).left).toBeCloseTo(ALL - USUAL.resolve - 50)
    // Past its usual time a step still has a few seconds left, until it is done.
    expect(at(200).left).toBeCloseTo(3 + ALL - USUAL.resolve - USUAL.fetch)
    expect(at(200).progress).toBeLessThan((USUAL.resolve + USUAL.fetch) / ALL)
  })

  it('barely moves for the six one-second steps, where counting steps jumped by 43%', () => {
    const before = pace(upTo(2, 101).states, upTo(2, 101).times, null, sec(101)).progress
    const after = pace(upTo(8, 102).states, upTo(8, 102).times, null, sec(102)).progress
    expect(after - before).toBeLessThan(0.01)
  })

  it('follows the AI calls done, and counts a call under way by its time so far', () => {
    const { states, times } = upTo(REPORT_STEPS.indexOf('extract'), 112)
    const tally: Tally = { reads_done: 10, reads_total: 20, now: ['a', 'b'] }
    const before = REPORT_STEPS.slice(0, REPORT_STEPS.indexOf('extract')).reduce((s, k) => s + USUAL[k], 0)
    const item = (USUAL.extract * 3) / 20
    const half = pace(states, times, tally, sec(150), { a: sec(150) })
    expect(half.progress).toBeCloseTo((before + USUAL.extract * 0.5) / ALL)
    const later = pace(states, times, tally, sec(150) + (item / 2) * 1000, { a: sec(150), b: sec(150) })
    expect(later.progress).toBeCloseTo((before + USUAL.extract * (11 / 20)) / ALL)
    // A call under way counts as at most 85% done.
    const stuck = pace(states, times, { ...tally, now: ['a'] }, sec(10_000), { a: sec(150) })
    expect(stuck.progress).toBeCloseTo((before + USUAL.extract * (10.85 / 20)) / ALL)
    // With calls still to finish, a few seconds are always left in the step.
    const nearly = pace(states, times, { reads_done: 19, reads_total: 20, now: ['z'] }, sec(10_000), { z: sec(150) })
    expect(nearly.left).toBeGreaterThanOrEqual(3)
  })

  it('paces by the engine’s usual times when it has them', () => {
    const { states, times } = upTo(1, 0)
    const quick = pace(states, times, { typical: { fetch: 10 } }, sec(5))
    expect(quick.left).toBeCloseTo(ALL - USUAL.fetch + 10 - USUAL.resolve - 5)
  })

  it('is done once every step is', () => {
    expect(pace(upTo(14).states, {}, null, sec(300))).toEqual({ progress: 1, left: 0 })
  })
})

describe('words for time', () => {
  it('rounds the time left so it doesn’t flicker', () => {
    expect(leftText(291)).toBe('about 5 min left')
    expect(leftText(150)).toBe('about 3 min left')
    expect(leftText(89)).toBe('about a minute left')
    expect(leftText(30)).toBe('under a minute left')
    expect(leftText(5)).toBe('a few seconds left')
  })

  it('shows a span as the clock does', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(7_900)).toBe('0:07')
    expect(clock(170_000)).toBe('2:50')
    expect(clock(-5)).toBe('0:00')
  })

  it('says a usual span in words', () => {
    expect(about(0.8)).toBe('about a second')
    expect(about(10)).toBe('about 10 s')
    expect(about(3)).toBe('about 5 s')
    expect(about(55)).toBe('about a minute')
    expect(about(130)).toBe('about 2 min')
  })
})
