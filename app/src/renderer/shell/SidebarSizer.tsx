// The sidebar's right edge, which sets its width (shell/sidebarWidth.ts). Pointed at, it shows the
// resize cursor; dragged, the sidebar follows the pointer at once, with no glide, and the width is
// kept when the drag ends. A double-click puts back the usual width. It is also a separator that
// the keyboard reaches: ← and → move it, Home and End go to the narrowest and the widest, and
// Return goes back to the usual width.
//
// Dragged well past the narrowest (SIDEBAR_CLOSE_AT), the sidebar closes, as in Finder: it slides
// away while the pointer is still down (onClosing), comes back if the pointer goes back, and stays
// closed once the drag ends there (onClose). The width it had before the drag is kept, so the
// sidebar's button brings it back as it was.
//
// App puts it right after the sidebar in the page, not inside it, as the sidebar hides what spills
// over its edge, and only while the sidebar shows. It starts below the window's top strip, so it
// never lies over an area that drags the window (styles.css, .sizer4).

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import {
  dragCloses,
  dragWidth,
  keyWidth,
  onSidebarWidth,
  setSidebarWidth,
  showSidebarWidth,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  sidebarWidth
} from './sidebarWidth'

type Props = {
  // While a drag would close the sidebar (true), and once it no longer would (false).
  onClosing: (closing: boolean) => void
  // A drag let go where it closes the sidebar.
  onClose: () => void
}

export function SidebarSizer({ onClosing, onClose }: Props) {
  const [width, setWidth] = useState(sidebarWidth)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  // Where a drag started: the pointer's x and the width then; and whether it would close now.
  const start = useRef<{ x: number; from: number; closing: boolean } | null>(null)
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
    start.current = { x: e.clientX, from: now.current, closing: false }
    setDragging(true)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const shut = dragCloses(s.from, s.x, e.clientX)
    if (shut !== s.closing) {
      s.closing = shut
      setClosing(shut)
      onClosing(shut)
    }
    // While it would close, the sidebar keeps the width it had last, for when it comes back.
    if (!shut) setWidth(dragWidth(s.from, s.x, e.clientX))
  }
  // The end of a drag; a second end (the capture lost after it was released) does nothing.
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const s = start.current
    if (!s) return
    start.current = null
    setDragging(false)
    if (s.closing) {
      // Closed: the width from before the drag stays kept, and shows again when the sidebar does.
      setClosing(false)
      showSidebarWidth(s.from)
      onClose()
    } else setSidebarWidth(now.current)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keyWidth(e.key, now.current, e.shiftKey)
    if (next === null) return
    e.preventDefault()
    setSidebarWidth(next)
  }

  const cls = [
    'sizer4',
    dragging ? 'on' : '',
    closing ? 'closing' : '',
    closing || width <= SIDEBAR_MIN ? 'min' : '',
    !closing && width >= SIDEBAR_MAX ? 'max' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const said = closing ? 'Let go to close the sidebar' : width === SIDEBAR_DEFAULT ? `Sidebar ${width} pixels wide, the usual width` : `Sidebar ${width} pixels wide`
  return (
    <div
      className={cls}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      aria-valuetext={said}
      tabIndex={0}
      title="Drag to resize the sidebar, or all the way left to close it; double-click for the usual width"
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
