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
// width. It covers only what the row draws, so a switch that is off doesn’t stretch the line.
export function metricScale(m: MetricItem, s: MetricsState): Scale {
  const values = [m.value]
  if (s.median && m.peer_median !== null) values.push(m.peer_median)
  if (s.peers) values.push(...m.peers.map((p) => p.value))
  return scaleOf(values, 0.08)
}
