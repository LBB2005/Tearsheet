import { describe, expect, it } from 'vitest'

import type { Band, MethodItem, ReportNumbers } from '../../shared/protocol'
import { METHODS_START, canShow, methodsScale } from './methods'

const method = (name: string, value: number): MethodItem => ({ method: name, label: name, value, readout: '' }) as MethodItem
const range = (bear: number, bull: number): Band => ({ bear, base: (bear + bull) / 2, bull, readout: '' })

// Only the fields these functions read; the rest of the numbers don't matter here.
const numbers = (over: Partial<ReportNumbers> = {}): ReportNumbers =>
  ({
    methods: [method('a', 115.24), method('b', 300), method('c', 546.1)],
    price: { value: 200, readout: '' },
    estimate: { value: 250, readout: '' },
    range: range(130.16, 419.62),
    ...over
  }) as ReportNumbers

const OFF = { range: false, price: false, estimate: false }

describe('METHODS_START', () => {
  it('has all three on', () => {
    expect(METHODS_START).toEqual({ range: true, price: true, estimate: true })
  })
})

describe('canShow', () => {
  it('is true for what is stored', () => {
    expect(canShow(numbers())).toEqual({ range: true, price: true, estimate: true })
  })

  it('is false for the price when none is stored', () => {
    expect(canShow(numbers({ price: null })).price).toBe(false)
  })

  it('is false for the estimate and the range when none are stored', () => {
    const c = canShow(numbers({ estimate: null, range: null }))
    expect(c.estimate).toBe(false)
    expect(c.range).toBe(false)
  })
})

describe('methodsScale', () => {
  it('covers the range’s bear and bull while it is on', () => {
    const s = methodsScale(numbers({ range: range(90, 600) }), METHODS_START)
    expect(s.lo).toBeLessThan(90)
    expect(s.hi).toBeGreaterThan(600)
  })

  it('covers the stored bear 130.16 and bull 419.62 with everything on', () => {
    const s = methodsScale(numbers(), METHODS_START)
    expect(s.lo).toBeLessThanOrEqual(130.16)
    expect(s.hi).toBeGreaterThanOrEqual(419.62)
  })

  it('covers only the methods, the price and the estimate with the range off', () => {
    const s = methodsScale(numbers({ range: range(90, 600) }), { ...METHODS_START, range: false })
    const pad = (546.1 - 115.24) * 0.05
    expect(s.lo).toBeCloseTo(115.24 - pad, 6)
    expect(s.hi).toBeCloseTo(546.1 + pad, 6)
  })

  it('covers the methods alone with all three off', () => {
    const s = methodsScale(numbers({ price: { value: 9999, readout: '' }, estimate: { value: -50, readout: '' } }), OFF)
    expect(s.lo).toBeCloseTo(115.24 - (546.1 - 115.24) * 0.05, 6)
    expect(s.hi).toBeCloseTo(546.1 + (546.1 - 115.24) * 0.05, 6)
  })

  it('covers the price while it is shown and stored', () => {
    const s = methodsScale(numbers({ price: { value: 900, readout: '' } }), { ...OFF, price: true })
    expect(s.hi).toBeGreaterThan(900)
  })

  it('ignores a switch that is on when nothing is stored', () => {
    const s = methodsScale(numbers({ price: null, estimate: null, range: null }), METHODS_START)
    expect(s).toEqual(methodsScale(numbers(), OFF))
  })

  it('copes with no methods stored', () => {
    expect(methodsScale(numbers({ methods: null, price: null, estimate: null, range: null }), METHODS_START)).toEqual({ lo: 0, hi: 1 })
  })
})
