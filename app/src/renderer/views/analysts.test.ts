import { describe, expect, test } from 'vitest'

import { ANALYSTS } from '../test/analysts'
import { ANALYSTS_START, firmsOn, sideCount, stateFor } from './analysts'

const firms = ANALYSTS.firms ?? []

describe('what a link from the report opens', () => {
  test('Buy, Hold or Sell opens the firms on that side', () => {
    expect(stateFor('hold', ANALYSTS_START)).toEqual({ tab: 'firms', side: 'hold' })
    expect(stateFor('sell', { tab: 'check', side: 'buy' })).toEqual({ tab: 'firms', side: 'sell' })
  })

  test('the targets open every firm', () => {
    expect(stateFor('firms', { tab: 'changes', side: 'hold' })).toEqual({ tab: 'firms', side: 'all' })
  })

  test('the recent changes and the trust check open their own tabs', () => {
    expect(stateFor('changes', { tab: 'firms', side: 'buy' })).toEqual({ tab: 'changes', side: 'buy' })
    expect(stateFor('check', ANALYSTS_START)).toEqual({ tab: 'check', side: 'all' })
  })

  test('no item, or one it doesn’t know, leaves the view as it was', () => {
    const was = { tab: 'changes', side: 'hold' } as const
    expect(stateFor(null, was)).toBe(was)
    expect(stateFor('rings', was)).toBe(was)
  })

  test('it starts on every firm', () => {
    expect(ANALYSTS_START).toEqual({ tab: 'firms', side: 'all' })
  })
})

describe('the firms on show', () => {
  test('every firm, newest first, or one side’s', () => {
    expect(firmsOn(firms, 'all')).toHaveLength(38)
    expect(firmsOn(firms, 'hold').map((f) => f.firm)).toEqual(['JP Morgan', 'Morgan Stanley', 'RBC Capital', 'Northland Capital Markets', 'Deutsche Bank', 'HSBC'])
    expect(firmsOn(firms, 'sell')).toEqual([])
  })

  test('each side’s count is the one analystdb gives', () => {
    expect(sideCount(ANALYSTS, 'all')).toBe(38)
    expect(sideCount(ANALYSTS, 'buy')).toBe(32)
    expect(sideCount(ANALYSTS, 'sell')).toBe(0)
    expect(sideCount({ ...ANALYSTS, sides: null, n_firms: null }, 'buy')).toBe(0)
  })
})
