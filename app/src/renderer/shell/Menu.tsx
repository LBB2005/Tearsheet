// A small pop-up menu: the sidebar's "…" and right-click menus, and its sort and filter menu.
// It opens with the first item focused (lit only when opened from the keyboard); ↑ ↓ Home End
// move, Return or Space picks, Esc or a click outside closes it and puts the focus back where it
// was. As in a Mac menu there is one highlight: the pointer moves the focus as it passes over an
// item, so hover and keys never light two items (styles.css .menu4.pointing), and leaving the
// menu puts the highlight out. Ticks (checkbox and radio items) keep
// it open, so several filters can be set at once; any other item closes it.

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export type MenuEntry =
  | { kind: 'item'; label: string; onSelect: () => void; danger?: boolean; shortcut?: string }
  | { kind: 'check'; label: string; checked: boolean; onSelect: () => void; radio?: boolean }
  | { kind: 'heading'; label: string }
  | { kind: 'separator' }

// The menu never covers the window's top strip, which drags the window (52 px).
const TOP_MIN = 56
const EDGE = 8

export function Menu({ label, at, entries, onClose }: { label: string; at: { left: number; top: number }; entries: MenuEntry[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(document.activeElement)
  const [place, setPlace] = useState(at)

  // Keep it inside the window: up from the bottom edge, left from the right one.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(EDGE, Math.min(at.left, window.innerWidth - w - EDGE))
    const top = Math.max(TOP_MIN, Math.min(at.top, window.innerHeight - h - EDGE))
    setPlace({ left, top })
    el.querySelector<HTMLButtonElement>('button')?.focus()
  }, [at.left, at.top])

  const close = () => {
    onClose()
    const back = opener.current
    if (back instanceof HTMLElement && back.isConnected) back.focus()
  }

  const pointing = (on: boolean) => box.current?.classList.toggle('pointing', on)

  const onKey = (e: KeyboardEvent) => {
    pointing(false)
    const items = Array.from(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const go = (n: number) => items[(n + items.length) % items.length]?.focus()
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      go(i + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      go(i < 0 ? -1 : i - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(-1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      close()
    }
  }

  return createPortal(
    <>
      <div
        className="menu4-scrim"
        onMouseDown={close}
        onContextMenu={(e) => {
          e.preventDefault()
          close()
        }}
      />
      <div
        ref={box}
        className="menu4"
        role="menu"
        aria-label={label}
        style={{ left: place.left, top: place.top }}
        onKeyDown={onKey}
        onMouseOver={(e) => {
          const item = (e.target as Element).closest('button')
          if (!item) return
          pointing(true)
          if (item !== document.activeElement) item.focus({ preventScroll: true })
        }}
        onMouseLeave={() => pointing(false)}
      >
        {entries.map((entry, i) => {
          if (entry.kind === 'separator') return <div key={i} className="sep" role="separator" />
          if (entry.kind === 'heading')
            return (
              <div key={i} className="mh" role="presentation">
                {entry.label}
              </div>
            )
          if (entry.kind === 'check')
            return (
              <button key={i} role={entry.radio ? 'menuitemradio' : 'menuitemcheckbox'} aria-checked={entry.checked} onClick={entry.onSelect}>
                <span className="ck" aria-hidden="true">
                  {entry.checked ? '✓' : ''}
                </span>
                {entry.label}
              </button>
            )
          return (
            <button
              key={i}
              role="menuitem"
              className={entry.danger ? 'danger' : undefined}
              onClick={() => {
                close()
                entry.onSelect()
              }}
            >
              {entry.label}
              {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
            </button>
          )
        })}
      </div>
    </>,
    document.body
  )
}
