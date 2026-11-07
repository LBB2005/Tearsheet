import { describe, expect, it } from 'vitest'

import type { Ring, Slice } from '../../shared/protocol'
import { NO_PEER_LIST, ringArcs } from './figures'

const slice = (key: Slice['key'], count: number): Slice => ({ key, label: key, count, readout: '', items: null })
const ring = (counts: [Slice['key'], number][]): Ring => ({
  total: counts.reduce((n, [, c]) => n + c, 0),
  slices: counts.map(([k, c]) => slice(k, c))
})

describe('ringArcs', () => {
  it('runs the slices round in order, each starting where the last ended', () => {
    const gap = 0.01
    const arcs = ringArcs(ring([['buy', 8], ['hold', 26], ['sell', 7]]), gap)
    expect(arcs.map((a) => a.key)).toEqual(['buy', 'hold', 'sell'])
    expect(arcs[0].from).toBe(0)
    expect(arcs[1].from).toBeCloseTo(8 / 41)
    expect(arcs[2].from).toBeCloseTo(34 / 41)
    expect(arcs[2].to + gap).toBeCloseTo(1)
    expect(arcs[0].to).toBeCloseTo(8 / 41 - gap)
  })

  it('leaves out a slice with a count of 0', () => {
    const arcs = ringArcs(ring([['buy', 3], ['hold', 0], ['sell', 1]]), 0.01)
    expect(arcs.map((a) => a.key)).toEqual(['buy', 'sell'])
    expect(arcs[1].from).toBeCloseTo(0.75)
  })

  it('gives nothing for a total of 0', () => {
    expect(ringArcs(ring([['buy', 0]]), 0.01)).toEqual([])
    expect(ringArcs({ total: 0, slices: [] }, 0.01)).toEqual([])
  })

  it('runs a single slice from 0 to 1 minus the gap', () => {
    expect(ringArcs(ring([['kept', 5]]), 0.02)).toEqual([{ key: 'kept', from: 0, to: 0.98 }])
  })

  it('never shortens a slice below 0.005', () => {
    const arcs = ringArcs(ring([['buy', 1], ['hold', 999]]), 0.05)
    expect(arcs[0].to - arcs[0].from).toBeCloseTo(0.005)
  })
})

describe('NO_PEER_LIST', () => {
  it('says plainly that the peers are not stored', () => {
    expect(NO_PEER_LIST).toBe('Which peers are Buy, Hold or Sell isn’t stored for this report.')
  })
})
