// The divider between the report and the chart (the spec's "The chart → Dragging the divider").
// It shows a grip line, and while it is dragged a small label reads "Half", "Full", "Narrowest"
// or "Drag further for full" as it snaps (split.ts). Dragging reports the pointer's position;
// the report page turns it into the chart's width. A double-click returns to Half. From the
// keyboard, the arrows move it and Return goes back to Half.

import type { KeyboardEvent, PointerEvent } from 'react'

import { CHART_MIN, type SnapLabel } from './split'

export interface DividerProps {
  // The snap label while dragging, if any.
  label: SnapLabel | null
  dragging: boolean
  // The chart's width now, and the most it can be, for assistive tech.
  width: number
  max: number
  onDrag: (clientX: number) => void
  onStart: () => void
  onDrop: () => void
  onHalf: () => void
  // An arrow key: a step wider (+) or narrower (−).
  onStep: (delta: number) => void
}

const STEP = 24

export function Divider({ label, dragging, width, max, onDrag, onStart, onDrop, onHalf, onStep }: DividerProps) {
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus({ preventScroll: true })
    onStart()
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onDrag(e.clientX)
  }
  // The end of a drag; the report page ignores a second one (lost capture after release).
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    onDrop()
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      onStep(e.key === 'ArrowLeft' ? STEP : -STEP)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onHalf()
    }
  }
  return (
    <div
      className={dragging ? 'divider hot' : 'divider'}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the chart"
      aria-valuemin={CHART_MIN}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(width)}
      aria-valuetext={label ?? `Chart ${Math.round(width)} pixels wide`}
      tabIndex={0}
      title="Drag to resize; double-click for half"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onDoubleClick={onHalf}
      onKeyDown={key}
    >
      <i />
      <span className={label ? 'snap show' : 'snap'}>{label ?? 'Half'}</span>
    </div>
  )
}
