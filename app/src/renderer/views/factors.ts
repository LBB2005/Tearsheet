// Score by factor: the order its rows can take and the switches it remembers.

import type { FactorItem } from '../../shared/protocol'

export type FactorSort = 'percentile' | 'weight'

export interface FactorsState {
  sort: FactorSort
  // The line at 50, the middle of the peers.
  median: boolean
}

export const FACTORS_START: FactorsState = { sort: 'percentile', median: true }

// `at` is the factor's stored position, which is what the report's link names, so it stays the
// same whichever way the rows are ordered.
export function sortFactors(fs: FactorItem[], sort: FactorSort): { at: number; f: FactorItem }[] {
  const first: 'percentile' | 'weight' = sort
  const second: 'percentile' | 'weight' = sort === 'percentile' ? 'weight' : 'percentile'
  return fs
    .map((f, at) => ({ at, f }))
    .sort((a, b) => b.f[first] - a.f[first] || b.f[second] - a.f[second] || (a.f.name < b.f.name ? -1 : a.f.name > b.f.name ? 1 : 0))
}
