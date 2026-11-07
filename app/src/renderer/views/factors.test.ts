import { describe, expect, it } from 'vitest'

import type { FactorItem } from '../../shared/protocol'
import { FACTORS_START, sortFactors } from './factors'

const f = (name: string, percentile: number, weight: number): FactorItem => ({ name, percentile, weight, readout: '' })
const three = [f('momentum', 35, 0.25), f('profitability', 93, 0.3), f('balance sheet', 76, 0.075)]
const names = (r: { f: FactorItem }[]) => r.map((x) => x.f.name)

describe('sortFactors', () => {
  it('starts by percentile with the median on', () => {
    expect(FACTORS_START).toEqual({ sort: 'percentile', median: true })
  })

  it('sorts by percentile, high to low', () => {
    expect(names(sortFactors(three, 'percentile'))).toEqual(['profitability', 'balance sheet', 'momentum'])
  })

  it('sorts by weight, high to low', () => {
    expect(names(sortFactors(three, 'weight'))).toEqual(['profitability', 'momentum', 'balance sheet'])
  })

  it('keeps the stored index of each factor', () => {
    expect(sortFactors(three, 'percentile').map((x) => x.at)).toEqual([1, 2, 0])
  })

  it('breaks a percentile tie by weight, then name', () => {
    const tied = [f('b', 50, 0.1), f('a', 50, 0.1), f('c', 50, 0.2)]
    expect(names(sortFactors(tied, 'percentile'))).toEqual(['c', 'a', 'b'])
  })

  it('breaks a weight tie by percentile, then name', () => {
    const tied = [f('b', 40, 0.1), f('a', 40, 0.1), f('c', 60, 0.1)]
    expect(names(sortFactors(tied, 'weight'))).toEqual(['c', 'a', 'b'])
  })

  it('leaves the stored list alone', () => {
    const before = names(three.map((x) => ({ ...x })).map((x) => ({ f: x })))
    sortFactors(three, 'weight')
    expect(names(three.map((x) => ({ f: x })))).toEqual(before)
  })
})
