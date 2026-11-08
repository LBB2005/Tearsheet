// The sidebar's right edge, which sets its width (shell/sidebarWidth.ts). Pointed at, it shows the
// resize cursor; dragged, the sidebar follows the pointer at once, with no glide, and the width is
// kept when the drag ends. A double-click puts back the usual width. It is also a separator that
// the keyboard reaches: ← and → move it, Home and End go to the narrowest and the widest, and
// Return goes back to the usual width.
//
// App puts it right after the sidebar in the page, not inside it, as the sidebar hides what spills
// over its edge, and only while the sidebar shows. It starts below the window's top strip, so it
// never lies over an area that drags the window (styles.css, .sizer4).

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { dragWidth, keyWidth, onSidebarWidth, setSidebarWidth, showSidebarWidth, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, sidebarWidth } from './sidebarWidth'

export function SidebarSizer() {
  const [width, setWidth] = useState(sidebarWidth)
  const [dragging, setDragging] = useState(false)
  // Where a drag started: the pointer's x and the width then.
  const start = useRef<{ x: number; from: number } | null>(null)
  const now = useRef(width)
  now.current = width

  // The page shows the width before it paints.
  useLayoutEffect(() => showSidebarWidth(width), [width])
  // A width set elsewhere (Settings) moves the edge too.
  useEffect(() => onSidebarWidth(setWidth), [])

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, from: now.current }
    setDragging(true)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (s && e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(dragWidth(s.from, s.x, e.clientX))
  }
  // The end of a drag; a second end (the capture lost after it was released) does nothing.
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!start.current) return
    start.current = null
    setDragging(false)
    setSidebarWidth(now.current)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keyWidth(e.key, now.current, e.shiftKey)
    if (next === null) return
    e.preventDefault()
    setSidebarWidth(next)
  }

  const cls = ['sizer4', dragging ? 'on' : '', width <= SIDEBAR_MIN ? 'min' : '', width >= SIDEBAR_MAX ? 'max' : ''].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      aria-valuetext={width === SIDEBAR_DEFAULT ? `Sidebar ${width} pixels wide, the usual width` : `Sidebar ${width} pixels wide`}
      tabIndex={0}
      title="Drag to resize the sidebar; double-click for the usual width"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
      onKeyDown={key}
    />
  )
}
