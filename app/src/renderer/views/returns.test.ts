import { describe, expect, it } from 'vitest'

import type { ReturnRow, ReturnSpan } from '../../shared/protocol'
import { RETURNS_START, returnRows, shownSpan, spansOffered, type ReturnsState } from './returns'

const row = (name: string, value: number | null): ReturnRow => ({ name, value, readout: `${name} readout` })
const span = (years: 1 | 3 | 5): ReturnSpan => ({
  years,
  company: row('Acme', 12),
  peers: years === 1 ? row('Peers', 8) : null,
  spy: row('S&P 500', 10),
  each_peer: years === 1 ? [row('AAA', 20), row('BBB', 5), row('CCC', null)] : []
})
const all: ReturnsState = { years: 1, peers: true, spy: true, each: true }
const kinds = (s: ReturnSpan, st: ReturnsState) => returnRows(s, st).map((r) => r.kind)

describe('spansOffered', () => {
  it('lists the spans that are stored', () => {
    expect(spansOffered([span(1), span(3)])).toEqual([1, 3])
  })
})

describe('shownSpan', () => {
  it('gives the span asked for', () => {
    expect(shownSpan([span(1), span(3)], 3)?.years).toBe(3)
  })

  it('falls back to 1 year when the one remembered is not stored', () => {
    expect(shownSpan([span(1), span(3)], 5)?.years).toBe(1)
  })

  it('gives nothing when no span is stored', () => {
    expect(shownSpan([], 1)).toBeNull()
  })
})

describe('returnRows', () => {
  it('starts at 1 year with peers and the S&P 500 on, each peer off', () => {
    expect(RETURNS_START).toEqual({ years: 1, peers: true, spy: true, each: false })
  })

  it('lists company, peers, S&P 500 and each peer at 1 year', () => {
    expect(kinds(span(1), all)).toEqual(['company', 'peers', 'spy', 'peer', 'peer', 'peer'])
  })

  it('keeps each peer in the engine’s order', () => {
    expect(returnRows(span(1), all).filter((r) => r.kind === 'peer').map((r) => r.row.name)).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('has no peer rows at 3 years, even with both on', () => {
    expect(kinds(span(3), { ...all, years: 3 })).toEqual(['company', 'spy'])
  })

  it('leaves out the S&P 500 when it is off', () => {
    expect(kinds(span(1), { ...all, spy: false })).not.toContain('spy')
  })

  it('leaves out peers and each peer when they are off', () => {
    expect(kinds(span(1), { ...all, peers: false, each: false })).toEqual(['company', 'spy'])
  })

  it('keeps a row whose value is null, so its readout can say so', () => {
    const rows = returnRows(span(1), all)
    expect(rows[rows.length - 1].row).toEqual({ name: 'CCC', value: null, readout: 'CCC readout' })
  })
})
