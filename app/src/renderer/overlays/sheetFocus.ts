// The keyboard inside a sheet that drops from the toolbar (the Refresh confirm, the flag sheet):
// Tab and Shift-Tab go round its own controls and never reach the page behind the scrim, and once
// it closes the focus goes back to whatever had it before it opened.

import { useRef, type KeyboardEvent } from 'react'

const FOCUSABLE = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

// Keeps Tab inside `box`. The box itself may hold the focus (it takes it as it opens): Tab then goes
// to its first control, Shift-Tab to its last.
export function keepTabIn(e: KeyboardEvent | globalThis.KeyboardEvent, box: HTMLElement | null): void {
  if (e.key !== 'Tab' || !box) return
  const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (items.length === 0) {
    e.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const at = document.activeElement
  const inside = at instanceof Node && box.contains(at) && at !== box
  if (e.shiftKey && (!inside || at === first)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (!inside || at === last)) {
    e.preventDefault()
    first.focus()
  }
}

// What had the focus as the sheet opened; `back()` returns it there, if it is still in the page.
export function useOpener(): { back: () => void } {
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement)
  return {
    back: () => {
      const was = opener.current
      if (was instanceof HTMLElement && was.isConnected && was !== document.body) was.focus()
    }
  }
}
