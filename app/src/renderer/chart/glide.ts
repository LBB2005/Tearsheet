// The chart's motion after it has drawn in (the spec's round two, "Motion: glide"). On a range or
// toggle change the lines don't draw again: the old and new lines are read at the same evenly
// spaced points across the chart, and the one slides to the other in GLIDE_MS. A line
// that comes or goes fades in FADE_MS (chart.css). Pure, so the pane and the tests share it.

export const GLIDE_MS = 350
export const FADE_MS = 200

// Fast at first, slowing as it lands.
export function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t))
  return 1 - (1 - k) ** 3
}

// A line's y at `n` evenly spaced x from x0 to x1, read between its points. Outside the part of
// the line that has values it holds the nearest one; a line with fewer than two has none.
export function resample(xs: number[], ys: (number | null)[], x0: number, x1: number, n: number): number[] | null {
  const px: number[] = []
  const py: number[] = []
  ys.forEach((y, i) => {
    if (y !== null && Number.isFinite(y)) {
      px.push(xs[i])
      py.push(y)
    }
  })
  if (px.length < 2 || n < 2) return null
  const out: number[] = []
  let k = 0
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / (n - 1)
    if (x <= px[0]) out.push(py[0])
    else if (x >= px[px.length - 1]) out.push(py[py.length - 1])
    else {
      while (k < px.length - 2 && px[k + 1] < x) k++
      const f = (x - px[k]) / (px[k + 1] - px[k] || 1)
      out.push(py[k] + (py[k + 1] - py[k]) * f)
    }
  }
  return out
}

// The line `t` of the way through a glide.
export function between(from: number[], to: number[], t: number): number[] {
  const e = ease(t)
  return to.map((y, i) => (from[i] ?? y) + (y - (from[i] ?? y)) * e)
}

// A line as drawn: its y at ys.length evenly spaced x from xa to xb.
export interface Track {
  xa: number
  xb: number
  ys: number[]
}

export const trackXs = (t: Track): number[] => t.ys.map((_, i) => (t.ys.length < 2 ? t.xa : t.xa + ((t.xb - t.xa) * i) / (t.ys.length - 1)))

// A track read at n points instead of its own.
const atPoints = (t: Track, n: number): Track => (t.ys.length === n ? t : { ...t, ys: resample(trackXs(t), t.ys, t.xa, t.xb, n) ?? t.ys })

// The line `t` of the way from one track to another. Both are read at the larger of their point
// counts, so the glide starts exactly on the old line and ends on the new one, whichever is longer.
export function glideTrack(from: Track | null, to: Track, t: number): Track {
  if (!from) return to
  const n = Math.max(from.ys.length, to.ys.length)
  const f = atPoints(from, n)
  const d = atPoints(to, n)
  const e = ease(t)
  return { xa: f.xa + (d.xa - f.xa) * e, xb: f.xb + (d.xb - f.xb) * e, ys: between(f.ys, d.ys, t) }
}

// What the chart does as its drawing changes: `start` a glide to a range or toggle change (from
// the lines as they are now, even mid-glide); `drop` any glide and just draw (a change with
// nothing drawn before it, or Reduce motion); `retarget` a glide the chart was resized under, so
// it carries on from where the lines are to where they are at the new size; or `keep` going.
export function nextGlide(o: { changed: boolean; running: boolean; drawn: boolean; reduced: boolean }): 'start' | 'drop' | 'retarget' | 'keep' {
  if (o.changed) return o.drawn && !o.reduced ? 'start' : 'drop'
  return o.running ? 'retarget' : 'keep'
}

// A glide on its way: the lines from where they were to where they go, `t` of the way there,
// with what fades in (`enter`) and the lines that fade out (`ghosts`), both fixed as it starts.
export interface GlideState<L, E> {
  from: L
  to: L
  t: number
  enter: E
  ghosts: { cls: string; track: Track }[]
}

// The chart resized under a glide: it carries on from where the lines are now to where they are
// at the new size, still fading what it was fading.
export function carryOn<L, E>(running: GlideState<L, E>, now: L, to: L): GlideState<L, E> {
  return { from: now, to, t: 0, enter: running.enter, ghosts: running.ghosts }
}
