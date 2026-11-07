import { describe, expect, it } from 'vitest'

import { at, scaleOf } from './scale'

describe('scaleOf', () => {
  it('pads the span by a share of itself on each side', () => {
    const s = scaleOf([0, 10], 0.1)
    expect(s.lo).toBeCloseTo(-1)
    expect(s.hi).toBeCloseTo(11)
  })

  it('pads a zero span by a tenth of the value', () => {
    const s = scaleOf([5, 5], 0.1)
    expect(s.lo).toBeCloseTo(4.5)
    expect(s.hi).toBeCloseTo(5.5)
  })

  it('pads a zero span at zero by 0.01', () => {
    expect(scaleOf([0], 0.1)).toEqual({ lo: -0.01, hi: 0.01 })
  })

  it('is 0 to 1 with no values', () => {
    expect(scaleOf([], 0.1)).toEqual({ lo: 0, hi: 1 })
  })
})

describe('at', () => {
  it('is a percentage along the scale, held to 0 to 100', () => {
    const s = { lo: 0, hi: 10 }
    expect(at(-5, s)).toBe(0)
    expect(at(5, s)).toBe(50)
    expect(at(99, s)).toBe(100)
  })
})
