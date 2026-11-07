import { describe, expect, it } from 'vitest'

import { ViewMemory } from './memory'

describe('ViewMemory', () => {
  it('gives the start state until a view keeps one', () => {
    const memory = new ViewMemory()
    expect(memory.get('factors', { sort: 'percentile' })).toEqual({ sort: 'percentile' })
    memory.set('factors', { sort: 'weight' })
    expect(memory.get('factors', { sort: 'percentile' })).toEqual({ sort: 'weight' })
  })

  it('keeps each view apart, each table too', () => {
    const memory = new ViewMemory()
    memory.set('factors', { sort: 'weight' })
    memory.set('table-valuation', { filter: 'dcf' })
    expect(memory.get('metrics', { sort: 'report' })).toEqual({ sort: 'report' })
    expect(memory.get('table-score', { filter: '' })).toEqual({ filter: '' })
    expect(memory.get('table-valuation', { filter: '' })).toEqual({ filter: 'dcf' })
  })

  it('keeps a view that has no switches of its own', () => {
    const memory = new ViewMemory()
    memory.set('rings', null)
    expect(memory.get('rings', 'start')).toBeNull()
  })

  it('starts afresh for a new report', () => {
    const old = new ViewMemory()
    old.set('factors', { sort: 'weight' })
    expect(new ViewMemory().get('factors', { sort: 'percentile' })).toEqual({ sort: 'percentile' })
  })
})
