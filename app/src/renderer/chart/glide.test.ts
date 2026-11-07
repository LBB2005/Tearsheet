import { describe, expect, it } from 'vitest'

import { between, ease, FADE_MS, GLIDE_MS, resample } from './glide'

describe('the timings', () => {
  it('glides in about a third of a second and fades in about a fifth', () => {
    expect(GLIDE_MS).toBe(350)
    expect(FADE_MS).toBe(200)
  })
})

describe('ease', () => {
  it('starts at 0, ends at 1, and slows as it lands', () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(0.5)).toBeCloseTo(0.875)
    expect(ease(-1)).toBe(0)
    expect(ease(2)).toBe(1)
  })
})

describe('resample', () => {
  it('reads a line at evenly spaced points across the chart', () => {
    expect(resample([0, 10, 20, 30, 40], [0, 10, 20, 30, 40], 0, 40, 5)).toEqual([0, 10, 20, 30, 40])
    expect(resample([0, 40], [0, 40], 0, 40, 3)).toEqual([0, 20, 40])
  })

  it('holds the nearest value outside the part of the line that has one', () => {
    expect(resample([0, 10, 20], [null, 5, 15], 0, 20, 3)).toEqual([5, 5, 15])
    expect(resample([0, 10, 20], [1, 3, null], 0, 20, 3)).toEqual([1, 3, 3])
  })

  it('has nothing to read from a line with fewer than two points', () => {
    expect(resample([0, 10], [null, 4], 0, 10, 4)).toBeNull()
    expect(resample([], [], 0, 10, 4)).toBeNull()
  })
})

describe('between', () => {
  const a = [0, 0, 0]
  const b = [100, 50, 10]

  it('is the old line at the start and the new one at the end', () => {
    expect(between(a, b, 0)).toEqual(a)
    expect(between(a, b, 1)).toEqual(b)
    expect(between(a, b, 0.5)).toEqual([87.5, 43.75, 8.75])
  })

  it('starts the next glide from wherever the line is now, with no jump', () => {
    const mid = between(a, b, 0.5)
    expect(between(mid, [5, 5, 5], 0)).toEqual(mid)
  })
})
