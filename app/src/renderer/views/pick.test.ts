import { describe, expect, it } from 'vitest'

import { pickIndex, pickKey } from './pick'

describe('pickIndex', () => {
  it('accepts a whole number inside the list', () => {
    expect(pickIndex('2', 3)).toBe(2)
    expect(pickIndex('0', 3)).toBe(0)
  })

  it('names nothing for anything else', () => {
    for (const item of ['3', '-1', '1.5', 'x', '', null, '01', ' 1', '1e0']) expect(pickIndex(item, 3)).toBeNull()
  })
})

describe('pickKey', () => {
  const methods = [{ method: 'DCF' }, { method: 'Comps' }]

  it('finds the entry with that key', () => {
    expect(pickKey('DCF', methods, (m) => m.method)).toBe(0)
    expect(pickKey('Comps', methods, (m) => m.method)).toBe(1)
  })

  it('names nothing for a key that is not there', () => {
    expect(pickKey('NOPE', methods, (m) => m.method)).toBeNull()
    expect(pickKey(null, methods, (m) => m.method)).toBeNull()
  })
})
