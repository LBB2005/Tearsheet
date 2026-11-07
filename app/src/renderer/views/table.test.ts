import { describe, expect, it } from 'vitest'

import { cellNumber, nextSort, numericColumn, tableRows, TABLE_START } from './table'

describe('cellNumber', () => {
  it('reads money, percentages, multiples and brackets', () => {
    expect(cellNumber('$1.2 billion')).toBe(1.2e9)
    expect(cellNumber('(3.4)%')).toBe(-3.4)
    expect(cellNumber('14.2×')).toBe(14.2)
    expect(cellNumber('-$340.3 million')).toBe(-340.3e6)
    expect(cellNumber('$2,500.0 billion')).toBe(2.5e12)
    expect(cellNumber('$1,234.50')).toBe(1234.5)
    expect(cellNumber('93')).toBe(93)
    expect(cellNumber('30.0%')).toBe(30)
    expect(cellNumber('−5.1%')).toBe(-5.1)
    expect(cellNumber('1,234,567')).toBe(1234567)
    expect(cellNumber('(3.4)')).toBe(-3.4)
  })

  it('reads anything else as no number', () => {
    expect(cellNumber('not meaningful')).toBeNull()
    expect(cellNumber('')).toBeNull()
    expect(cellNumber('4 Nov 2026')).toBeNull()
    expect(cellNumber('(3.4')).toBeNull()
  })
})

describe('numericColumn', () => {
  const rows = [['Method', 'Value'], ['DCF', '$1.2 billion'], ['Comps', '$90']]
  it('is true when every data cell is a number', () => expect(numericColumn(rows, 1)).toBe(true))
  it('is false for words, and for a table with no data rows', () => {
    expect(numericColumn(rows, 0)).toBe(false)
    expect(numericColumn([['Method', 'Value']], 1)).toBe(false)
  })
})

describe('tableRows', () => {
  const money = [['Item', 'Value'], ['a', '$340.3 million'], ['b', '$1.2 billion'], ['c', '$90']]

  it('a column of money sorts by size', () => {
    const asc = tableRows(money, { sort: { col: 1, dir: 'asc' }, filter: '' })
    expect(asc.map((r) => r.cells[1])).toEqual(['$90', '$340.3 million', '$1.2 billion'])
    const desc = tableRows(money, { sort: { col: 1, dir: 'desc' }, filter: '' })
    expect(desc.map((r) => r.cells[1])).toEqual(['$1.2 billion', '$340.3 million', '$90'])
  })

  it('keeps the file order and each row’s place with no sort', () => {
    expect(tableRows(money, TABLE_START).map((r) => r.at)).toEqual([0, 1, 2])
  })

  it('a column with one word cell sorts as text', () => {
    const rows = [['Item', 'Value'], ['a', '$115.24'], ['b', 'not meaningful'], ['c', '$236.36'], ['d', '$115.24']]
    const asc = tableRows(rows, { sort: { col: 1, dir: 'asc' }, filter: '' })
    // As text, the dollar cells compare digit by digit and come before the word; equal cells keep their order.
    expect(asc.map((r) => r.cells[0])).toEqual(['a', 'd', 'c', 'b'])
    const desc = tableRows(rows, { sort: { col: 1, dir: 'desc' }, filter: '' })
    expect(desc.map((r) => r.cells[0])).toEqual(['b', 'c', 'a', 'd'])
    // The filter still finds the word cell.
    expect(tableRows(rows, { sort: null, filter: 'meaningful' }).map((r) => r.at)).toEqual([1])
  })

  it('the filter matches any cell, whatever its case', () => {
    const rows = [['Method', 'Value'], ['DCF', '$10'], ['Comps', '$20']]
    expect(tableRows(rows, { sort: null, filter: 'dcf' }).map((r) => r.cells[0])).toEqual(['DCF'])
    expect(tableRows(rows, { sort: null, filter: '$20' }).map((r) => r.cells[0])).toEqual(['Comps'])
    expect(tableRows(rows, { sort: null, filter: '   ' })).toHaveLength(2)
  })

  it('a filter that matches nothing gives no rows', () => {
    expect(tableRows(money, { sort: null, filter: 'zzz' })).toEqual([])
  })
})

describe('nextSort', () => {
  it('goes off, ascending, descending, then ascending again', () => {
    const a = nextSort(null, 2)
    expect(a).toEqual({ col: 2, dir: 'asc' })
    const d = nextSort(a, 2)
    expect(d).toEqual({ col: 2, dir: 'desc' })
    expect(nextSort(d, 2)).toEqual({ col: 2, dir: 'asc' })
  })
  it('starts ascending on a different column', () => {
    expect(nextSort({ col: 1, dir: 'desc' }, 3)).toEqual({ col: 3, dir: 'asc' })
  })
})
