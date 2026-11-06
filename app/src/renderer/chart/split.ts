// The chart split's widths (the spec's "The chart → Dragging the divider"). The chart opens from
// the right beside the report, with a divider between them. The chart is never narrower than
// CHART_MIN and the report never narrower than TEXT_MIN. There is a soft snap at Half, and
// dragging past the report's limit by more than FULL_OVERSHOOT snaps to Full: everything right
// of the sidebar, never covering it. `avail` is that width; `raw` is the chart width a drag asks
// for. Pure, so the drag, the toolbar and the tests share it.

export const DIV = 8
export const CHART_MIN = 360
export const TEXT_MIN = 340
export const HALF_SNAP = 16
export const FULL_OVERSHOOT = 30

export type SnapMode = 'half' | 'full' | 'free' | 'min'
export type SnapLabel = 'Half' | 'Full' | 'Narrowest' | 'Drag further for full'

export interface Snap {
  width: number
  mode: SnapMode
  label: SnapLabel | null
}

// The settings choice "When the chart opens": Full, Half, or Where I left it.
export type ChartOpens = 'full' | 'half' | 'last'

// Where the chart sits while it is open. Half and Full follow the space as the window or the
// sidebar changes; a dragged width stays, kept inside both limits.
export interface Split {
  mode: SnapMode
  width: number
}

// Too narrow for the chart and the report side by side: the chart takes it all.
const tooNarrow = (avail: number) => avail < CHART_MIN + TEXT_MIN + DIV
// The widest the chart goes with the report still beside it.
const widest = (avail: number) => avail - TEXT_MIN - DIV
const halfOf = (avail: number) => Math.min(widest(avail), Math.max(CHART_MIN, Math.round(avail / 2)))
const full = (avail: number): Snap => ({ width: Math.max(0, avail), mode: 'full', label: 'Full' })

export function snapWidth(raw: number, avail: number): Snap {
  if (tooNarrow(avail)) return full(avail)
  const max = widest(avail)
  if (raw > max + FULL_OVERSHOOT) return full(avail)
  if (raw > max) return { width: max, mode: 'free', label: 'Drag further for full' }
  if (!(raw >= CHART_MIN)) return { width: CHART_MIN, mode: 'min', label: 'Narrowest' }
  const half = halfOf(avail)
  if (Math.abs(raw - half) <= HALF_SNAP) return { width: half, mode: 'half', label: 'Half' }
  return { width: Math.round(raw), mode: 'free', label: null }
}

// The chart's width as it opens. `last` is the width it was left at: null for Half (or nothing
// remembered), Infinity for Full (prefs.ts).
export function openWidth(pref: ChartOpens, last: number | null, avail: number): number {
  if (pref === 'full') return full(avail).width
  if (pref === 'half' || last === null) return snapWidth(halfOf(avail), avail).width
  return snapWidth(last, avail).width
}

export function openSplit(pref: ChartOpens, last: number | null, avail: number): Split {
  const snap = snapWidth(openWidth(pref, last, avail), avail)
  return { mode: snap.mode, width: snap.width }
}

// The chart's width now, in the space there is now.
export function splitWidth(split: Split, avail: number): number {
  if (tooNarrow(avail) || split.mode === 'full') return full(avail).width
  if (split.mode === 'half') return halfOf(avail)
  return Math.min(widest(avail), Math.max(CHART_MIN, Math.round(split.width)))
}
