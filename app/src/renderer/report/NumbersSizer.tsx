// The line between the report's numbers column and its Summary / Full report text, which sets the
// numbers column's width (report/numbersWidth.ts). Pointed at, it shows the resize cursor and a
// faint line; dragged, the column follows the pointer at once and the width is kept when the drag
// ends. A double-click puts back the usual width. It is also a separator that the keyboard
// reaches: ← and → move it, Home and End go to the narrowest and the widest, and Return goes back
// to the usual width.
//
// It lies over the report's frame (pages/Report.tsx puts it in .rframe), at the column's edge, as
// the page's CSS works it out from --nums-w on .rframe (report.css .nsizer), so a window resize
// moves both at once with no script. While it is dragged, no frame takes the pointer and nothing
// is selected (report.css). A drag moves the column once a frame (requestAnimationFrame): the
// width goes onto .rframe and to each frame's page by message, with no React render.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { dragWidth, keyWidth, NUMBERS_DEFAULT, NUMBERS_MIN, numbersWidth, setNumbersWidth, shownWidth, widest, widthMessage } from './numbersWidth'

// Gives each of the report's frames a width: onto .rframe for the line, and to each page's script.
export function showNumbersWidth(box: HTMLElement | null, px: number): void {
  if (!box) return
  box.style.setProperty('--nums-w', `${px}px`)
  for (const frame of box.querySelectorAll('iframe')) postWidth(frame, px)
}

// One frame's page. A frame not yet loaded takes it from its style block, and again once loaded.
export function postWidth(frame: HTMLIFrameElement, px: number): void {
  // The page is an empty-sandbox srcdoc with no origin of its own, so it can't be named; the
  // script there takes a message from this window only, and a number only.
  frame.contentWindow?.postMessage(widthMessage(px), '*')
}

const said = (w: number) => (w === NUMBERS_DEFAULT ? `Numbers column ${w} pixels wide, the usual width` : `Numbers column ${w} pixels wide`)

// `frame` is the report frame's width now.
export function NumbersSizer({ frame }: { frame: number }) {
  const [kept, setKept] = useState(numbersWidth)
  const [dragging, setDragging] = useState(false)
  const el = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; from: number; at: number } | null>(null)
  const raf = useRef(0)
  const width = shownWidth(kept, frame)
  const now = useRef(width)
  now.current = width

  // The frames show the width kept before the page paints; a width kept elsewhere (a drag that
  // ended) shows at once.
  useLayoutEffect(() => showNumbersWidth(el.current?.parentElement ?? null, kept), [kept])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const box = () => el.current?.parentElement ?? null
  const keep = (px: number) => {
    const w = setNumbersWidth(px)
    setKept(w)
    showNumbersWidth(box(), w)
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, from: now.current, at: now.current }
    setDragging(true)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const next = dragWidth(s.from, s.x, e.clientX, frame)
    if (next === s.at) return
    s.at = next
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      showNumbersWidth(box(), next)
      el.current?.setAttribute('aria-valuenow', String(next))
    })
  }
  // The end of a drag; a second end (the capture lost after it was released) does nothing.
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const s = start.current
    if (!s) return
    start.current = null
    cancelAnimationFrame(raf.current)
    setDragging(false)
    // A click with no move (the first of a double-click, say) keeps nothing: the width kept may
    // be wider than this window shows, and stays so.
    if (s.at === s.from) return
    el.current?.setAttribute('aria-valuenow', String(s.at))
    keep(s.at)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keyWidth(e.key, now.current, frame, e.shiftKey)
    if (next === null) return
    e.preventDefault()
    keep(next)
  }

  const most = widest(frame)
  const cls = ['nsizer', dragging ? 'on' : '', width <= NUMBERS_MIN ? 'min' : '', width >= most ? 'max' : ''].filter(Boolean).join(' ')
  return (
    <div
      ref={el}
      className={cls}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the numbers column"
      aria-valuemin={NUMBERS_MIN}
      aria-valuemax={most}
      aria-valuenow={width}
      aria-valuetext={said(width)}
      tabIndex={0}
      title="Drag to resize the numbers and the text; double-click for the usual width"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onDoubleClick={() => keep(NUMBERS_DEFAULT)}
      onKeyDown={key}
    />
  )
}
