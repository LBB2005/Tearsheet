// What the red flags, economy and rings views share. The rings are drawn as arcs, and this works
// out where each one runs.

import type { Ring, Slice } from '../../shared/protocol'

// Peer ratings keep only how many peers are Buy, Hold or Sell, so there is nothing to list.
export const NO_PEER_LIST = 'Which peers are Buy, Hold or Sell isn’t stored for this report.'

// A slice never shrinks to nothing, or a small one would vanish from the ring.
const MIN_ARC = 0.005

// Each slice's start and end as a fraction of the way round, in slice order. The gap is cut from the
// end of every slice so neighbours are told apart; the next slice still starts where this one’s
// full share ended. A slice with a count of 0 has no arc.
export function ringArcs(ring: Ring, gap: number): { key: Slice['key']; from: number; to: number }[] {
  if (ring.total <= 0) return []
  const arcs: { key: Slice['key']; from: number; to: number }[] = []
  let from = 0
  for (const s of ring.slices) {
    if (s.count <= 0) continue
    const share = s.count / ring.total
    arcs.push({ key: s.key, from, to: from + Math.max(MIN_ARC, share - gap) })
    from += share
  }
  return arcs
}
