// Key metrics: the order its rows can take, the switches it remembers, and the line each row's
// dots sit on.

import type { MetricItem } from '../../shared/protocol'
import { scaleOf, type Scale } from './scale'

export type MetricSort = 'report' | 'below'

export interface MetricsState {
  sort: MetricSort
  // Each peer’s own value, as a small dot.
  peers: boolean
  // The tick at the peers’ median.
  median: boolean
}

export const METRICS_START: MetricsState = { sort: 'report', peers: false, median: true }

// "Below" puts the metric the company beats the most peers on first. A metric with no percentile
// goes last, and ties keep the report’s order (the sort is stable).
export function sortMetrics(ms: MetricItem[], sort: MetricSort): MetricItem[] {
  if (sort === 'report') return ms.slice()
  const rank = (m: MetricItem): number => m.percentile ?? -Infinity
  return ms.slice().sort((a, b) => rank(b) - rank(a))
}

// Every row has its own line, so a metric in billions and one in percent each use their full
// width. The line always spans the peer group, whether or not each peer's dot is drawn: with only
// the company and the median on it, the two would always sit at its two ends, on every row, and
// say nothing about how far apart they are. The median, when it is on, is always inside it.
export function metricScale(m: MetricItem, s: MetricsState): Scale {
  const values = [m.value, ...m.peers.map((p) => p.value)]
  if (s.median && m.peer_median !== null) values.push(m.peer_median)
  return scaleOf(values, 0.08)
}
