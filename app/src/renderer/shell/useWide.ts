// Whether the window is wide enough for the sidebar beside the page. Below 1,100 px the sidebar
// is hidden, and its button opens it over the page instead (the spec's "Narrow windows").
//
// A resize across 1,100 px changes the layout at once, as a Mac window's parts do: the sidebar
// goes or comes back and the toolbar makes room for the window buttons in the same frame, with
// no glide, so the page keeps up with the window edge. The change is drawn in the frame whose
// media query flipped (flushSync), and while it is drawn the root carries data-snap, which turns
// every transition off (styles.css). Hiding or showing the sidebar with its button still glides.

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export const WIDE_MIN_PX = 1100

const QUERY = `(min-width: ${WIDE_MIN_PX}px)`

// Runs `change` (a React update) with transitions off, and has the page take its new style
// before they are back on, so nothing it moves glides. No timer: the style is worked out here,
// and only the style; the layout is left to the frame, so it is done once.
export function snap(change: () => void, root: HTMLElement = document.documentElement): void {
  root.dataset.snap = ''
  try {
    flushSync(change)
    // Reading a computed style works the page's new style out now, while transitions are off.
    void getComputedStyle(root).transitionDuration
  } finally {
    delete root.dataset.snap
  }
}

export function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => snap(() => setWide(media.matches))
    // In case it changed before this ran; nothing has been drawn from it yet.
    setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return wide
}
