import { describe, expect, it } from 'vitest'

import type { MetricItem, PeerValue } from '../../shared/protocol'
import { METRICS_START, metricScale, sortMetrics } from './metrics'

const peer = (value: number): PeerValue => ({ ticker: 'P', value, text: String(value), readout: '' })
const m = (name: string, percentile: number | null, over: Partial<MetricItem> = {}): MetricItem => ({
  name,
  label: name,
  value: 10,
  text: '10',
  peer_median: 20,
  median_text: '20',
  percentile,
  peers: [],
  readout: '',
  ...over
})
const names = (ms: MetricItem[]) => ms.map((x) => x.name)

describe('sortMetrics', () => {
  it('starts in report order, median on, peers off', () => {
    expect(METRICS_START).toEqual({ sort: 'report', peers: false, median: true })
  })

  it('puts the highest share below first and null last', () => {
    expect(names(sortMetrics([m('a', null), m('b', 67), m('c', 95)], 'below'))).toEqual(['c', 'b', 'a'])
  })

  it('keeps the report order among ties', () => {
    expect(names(sortMetrics([m('a', 50), m('b', 50), m('c', null), m('d', null)], 'below'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves report order unchanged', () => {
    const list = [m('a', 10), m('b', 90), m('c', null)]
    expect(names(sortMetrics(list, 'report'))).toEqual(['a', 'b', 'c'])
  })

  it('does not reorder the stored list', () => {
    const list = [m('a', 10), m('b', 90)]
    sortMetrics(list, 'below')
    expect(names(list)).toEqual(['a', 'b'])
  })
})

describe('metricScale', () => {
  const item = m('x', 50, { value: 10, peer_median: 20, peers: [peer(100)] })

  it('ignores the peers while they are off', () => {
    const s = metricScale(item, { sort: 'report', peers: false, median: true })
    expect(s.hi).toBeLessThan(100)
  })

  it('covers every peer while they are on', () => {
    const s = metricScale(item, { sort: 'report', peers: true, median: true })
    expect(s.hi).toBeGreaterThan(100)
  })

  it('ignores the median while it is off', () => {
    const s = metricScale(item, { sort: 'report', peers: false, median: false })
    // Only the value is left, so the zero span is padded by a tenth of it.
    expect(s).toEqual({ lo: 9, hi: 11 })
  })

  it('skips a null median', () => {
    const s = metricScale(m('y', 1, { peer_median: null }), METRICS_START)
    expect(s).toEqual({ lo: 9, hi: 11 })
  })
})
