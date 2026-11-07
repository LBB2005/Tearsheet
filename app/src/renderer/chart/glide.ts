// The chart's motion after it has drawn in (the spec's round two, "Motion: glide"). On a range or
// toggle change the lines don't draw again: the old line is read at the new line's own points
// (evenly spaced across the chart), and slides to it in GLIDE_MS, landing exactly on it. A line
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
