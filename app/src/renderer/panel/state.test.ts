import { describe, expect, it } from 'vitest'

import { asked, FIRST, opened, switched, type Panel } from './state'

const showing = (view: Panel['view'], item: string | null = null, last: Panel['last'] = view === 'price' ? null : view, rangeAsk = 0): Panel => ({ view, item, last, rangeAsk })

describe('the panel’s view', () => {
  it('starts on the price chart, with nothing to switch back to', () => {
    expect(FIRST).toEqual({ view: 'price', item: null, last: null, rangeAsk: 0 })
  })

  it('the same chart again does nothing', () => {
    expect(asked(showing('factors'), true, 'factors', null)).toBeNull()
    expect(asked(showing('factors', '1'), true, 'factors', '1')).toBeNull()
  })

  it('a link while the panel is closed or closing always opens it', () => {
    expect(asked(FIRST, false, 'factors', null)).toEqual({ view: 'factors', item: null, last: 'factors', rangeAsk: 0 })
    // Sliding shut on the very view the link asks for: it still opens again.
    expect(asked(showing('factors'), false, 'factors', null)).toEqual({ view: 'factors', item: null, last: 'factors', rangeAsk: 0 })
  })

  it('another item in the same view picks it', () => {
    expect(asked(showing('factors'), true, 'factors', '1')).toEqual({ view: 'factors', item: '1', last: 'factors', rangeAsk: 0 })
  })

  it('another view becomes the one to switch back to', () => {
    expect(asked(showing('factors'), true, 'table-valuation', '2')).toEqual({ view: 'table-valuation', item: '2', last: 'table-valuation', rangeAsk: 0 })
  })

  it('a link to the price chart asks for the range', () => {
    expect(asked(showing('metrics'), true, 'price', null)).toEqual({ view: 'price', item: null, last: 'metrics', rangeAsk: 1 })
    expect(asked(showing('price', null, 'metrics', 1), false, 'price', null)).toEqual({ view: 'price', item: null, last: 'metrics', rangeAsk: 2 })
  })

  it('⌘3 opens the price chart', () => {
    expect(opened({ view: 'metrics', item: 'x', last: 'metrics', rangeAsk: 2 })).toEqual({ view: 'price', item: null, last: 'metrics', rangeAsk: 0 })
  })

  it('the switch goes back to the price chart and keeps last', () => {
    const back = switched({ view: 'factors', item: '2', last: 'factors', rangeAsk: 1 }, 'price')
    expect(back).toEqual({ view: 'price', item: null, last: 'factors', rangeAsk: 1 })
    expect(switched(back, 'factors')).toEqual({ view: 'factors', item: null, last: 'factors', rangeAsk: 1 })
  })
})
