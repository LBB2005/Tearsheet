import { describe, expect, it } from 'vitest'

import { viewTitle } from './titles'

describe('viewTitle', () => {
  it('names each view', () => {
    expect(viewTitle('price', null)).toBe('Price chart')
    expect(viewTitle('factors', null)).toBe('Score by factor')
    expect(viewTitle('metrics', null)).toBe('Key metrics')
    expect(viewTitle('methods', null)).toBe('Value per share by method')
    expect(viewTitle('returns', null)).toBe('Total return')
    expect(viewTitle('flags', null)).toBe('Red flags')
    expect(viewTitle('economy', null)).toBe('Economy')
    expect(viewTitle('rings', null)).toBe('Peer ratings and checks')
  })

  it('names a table by its own title', () => {
    expect(viewTitle('table-valuation', [{ key: 'valuation', title: 'Valuation', rows: [] }])).toBe('Valuation table')
  })

  it('calls a table it can’t find a table', () => {
    expect(viewTitle('table-x', null)).toBe('Table')
    expect(viewTitle('table-x', [])).toBe('Table')
    expect(viewTitle('table-x', [{ key: 'valuation', title: 'Valuation', rows: [] }])).toBe('Table')
  })
})
