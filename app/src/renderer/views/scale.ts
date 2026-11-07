// A number line for a row of dots: where the ends sit, and how far along a value falls.

export interface Scale {
  lo: number
  hi: number
}

// The line runs a little past the lowest and highest value so no dot sits on the edge. When every
// value is the same there is no span to pad, so the line widens by a tenth of the value instead.
export function scaleOf(values: number[], pad: number): Scale {
  if (values.length === 0) return { lo: 0, hi: 1 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo
  if (span === 0) {
    const gap = Math.max(Math.abs(lo) * 0.1, 0.01)
    return { lo: lo - gap, hi: hi + gap }
  }
  return { lo: lo - span * pad, hi: hi + span * pad }
}

// How far along the line a value sits, as a percentage held to the line's ends.
export function at(v: number, s: Scale): number {
  return Math.max(0, Math.min(100, ((v - s.lo) / (s.hi - s.lo)) * 100))
}
