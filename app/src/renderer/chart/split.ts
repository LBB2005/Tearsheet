// The chart split's widths (the spec's "The chart → Dragging the divider"). The chart opens from
// the right beside the report, at Half, with a divider between them; the chart's own Narrow,
// Half, Wide and Full buttons set it too. The chart is never narrower than
// CHART_MIN and the report never narrower than TEXT_MIN. There is a soft snap at Half, and
// dragging past the report's limit by more than FULL_OVERSHOOT snaps to Full: everything right
// of the sidebar, never covering it. `avail` is that width; `raw` is the chart width a drag asks
// for. Pure, so the drag, the toolbar and the tests share it.

export const DIV = 8
export const CHART_MIN = 360
export const TEXT_MIN = 340
export const HALF_SNAP = 16
export const FULL_OVERSHOOT = 30

export type SnapMode = 'narrow' | 'half' | 'wide' | 'full' | 'free' | 'min'
// The chart header's width buttons.
export type Preset = 'narrow' | 'half' | 'wide' | 'full'
export const PRESETS: readonly Preset[] = ['narrow', 'half', 'wide', 'full']
export type SnapLabel = 'Half' | 'Full' | 'Narrowest' | 'Drag further for full'

export interface Snap {
  width: number
  mode: SnapMode
  label: SnapLabel | null
}

// Where the chart sits while it is open. The presets follow the space as the window or the
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
const narrowOf = (avail: number) => Math.min(widest(avail), Math.max(CHART_MIN, Math.round(avail / 3)))
const wideOf = (avail: number) => Math.max(CHART_MIN, Math.min(widest(avail), Math.round((avail * 2) / 3)))
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

// A width button's split, in the space there is now. Too narrow for both, every one is Full.
export function presetSplit(p: Preset, avail: number): Split {
  if (tooNarrow(avail) || p === 'full') return { mode: 'full', width: full(avail).width }
  return { mode: p, width: p === 'narrow' ? narrowOf(avail) : p === 'wide' ? wideOf(avail) : halfOf(avail) }
}

// The chart's width now, in the space there is now.
export function splitWidth(split: Split, avail: number): number {
  if (tooNarrow(avail) || split.mode === 'full') return full(avail).width
  if (split.mode === 'half') return halfOf(avail)
  if (split.mode === 'narrow') return narrowOf(avail)
  if (split.mode === 'wide') return wideOf(avail)
  return Math.min(widest(avail), Math.max(CHART_MIN, Math.round(split.width)))
}
