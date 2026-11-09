// The sidebar's width, which Liam sets by dragging its right edge (shell/SidebarSizer.tsx), as in
// Finder and the Claude app. The arrow keys move the edge too, and a double-click (or Return)
// puts it back to the usual width. It is kept between launches. Dragged well past the narrowest,
// to under half of it, the sidebar closes, as in Finder; the width it had is kept for next time.
//
// The limits come from the rows. The widest row there can be (a five-letter ticker, the official
// tick, a four-digit close and the HOLD tag, measured in Avenir Next) needs 224 px, so the
// sidebar never goes narrower and nothing in a row is ever cut off. At 360 px, the widest, a
// window just wide enough to keep the sidebar beside the page (1,100 px, useWide.ts) still has
// room for the chart beside a report (chart/split.ts: 708 px).
//
// Kept in localStorage as sidebar.width, in whole pixels; none means the usual width. The page
// carries it as --sw on <html>, which styles.css uses for the sidebar, its edge and the sidebar
// opened over the page in a narrow window. Another part of the window (a Settings choice, say)
// can change it with setSidebarWidth, and the sidebar follows at once.

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Root = { style: Pick<CSSStyleDeclaration, 'setProperty'> }

export const SIDEBAR_MIN = 224
export const SIDEBAR_DEFAULT = 232
export const SIDEBAR_MAX = 360
// A drag that takes the edge under this closes the sidebar: half the narrowest, so a drag that
// only meant to make it narrow, and went a little too far, never closes it by mistake.
export const SIDEBAR_CLOSE_AT = SIDEBAR_MIN / 2
// One arrow key press; with Shift, a bigger step.
export const SIDEBAR_STEP = 16
export const SIDEBAR_BIG_STEP = 64

const KEY = 'sidebar.width'

const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const page = (): Root | null => (typeof document === 'undefined' ? null : document.documentElement)

// A width inside the limits, in whole pixels. Anything that isn't a number is the usual width.
export function clampWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)))
}

export function sidebarWidth(store: Store | null = local()): number {
  let value: string | null = null
  try {
    value = store?.getItem(KEY) ?? null
  } catch {
    // The usual width applies.
  }
  return value === null || value.trim() === '' ? SIDEBAR_DEFAULT : clampWidth(Number(value))
}

// Shows a width without keeping it, as the edge is dragged.
export function showSidebarWidth(px: number, root: Root | null = page()): void {
  root?.style.setProperty('--sw', `${clampWidth(px)}px`)
}

// At start-up (main.tsx), so the sidebar has its width before anything shows.
export function applySidebarWidth(store: Store | null = local(), root: Root | null = page()): void {
  showSidebarWidth(sidebarWidth(store), root)
}

const listeners = new Set<(px: number) => void>()

// Tells `fn` each time the width is set, until the returned function is called.
export function onSidebarWidth(fn: (px: number) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// Keeps a width, shows it, and tells the sidebar. Returns the width kept, inside the limits.
export function setSidebarWidth(px: number, store: Store | null = local(), root: Root | null = page()): number {
  const width = clampWidth(px)
  try {
    if (width === SIDEBAR_DEFAULT) store?.removeItem(KEY)
    else store?.setItem(KEY, String(width))
  } catch {
    // Not kept; it still shows until the window reloads.
  }
  showSidebarWidth(width, root)
  for (const fn of listeners) fn(width)
  return width
}

// The width a key asks for on the sidebar's edge, or null for a key the edge doesn't use: ← and →
// a step narrower or wider (Shift, a bigger step), Home and End the narrowest and the widest,
// Return the usual width.
export function keyWidth(key: string, width: number, shift = false): number | null {
  const step = shift ? SIDEBAR_BIG_STEP : SIDEBAR_STEP
  if (key === 'ArrowLeft') return clampWidth(width - step)
  if (key === 'ArrowRight') return clampWidth(width + step)
  if (key === 'Home') return SIDEBAR_MIN
  if (key === 'End') return SIDEBAR_MAX
  if (key === 'Enter') return SIDEBAR_DEFAULT
  return null
}

// The width a drag asks for: where it started, moved by how far the pointer has gone.
export function dragWidth(from: number, startX: number, x: number): number {
  return clampWidth(from + x - startX)
}

// Whether a drag has taken the edge far enough to close the sidebar once it is let go.
export function dragCloses(from: number, startX: number, x: number): boolean {
  return from + x - startX < SIDEBAR_CLOSE_AT
}
