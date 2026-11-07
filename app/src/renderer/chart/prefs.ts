// The window's own small preferences, kept in localStorage:
//   sidebar.hidden   '1' while the sidebar is hidden (⌃⌘S).
// A storage that can't be read or written (it shouldn't happen in the app) falls back to the
// defaults.

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEYS = { sidebar: 'sidebar.hidden' } as const
const OLD_KEYS = ['chart.opens', 'chart.lastWidth'] as const

const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function read(key: string, store: Store | null): string | null {
  try {
    return store?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key: string, value: string | null, store: Store | null): void {
  try {
    if (value === null) store?.removeItem(key)
    else store?.setItem(key, value)
  } catch {
    // Not kept; the default applies next time.
  }
}

// The keys an earlier version kept: the "When the chart opens" choice and the width the chart was
// left at. The chart opens at Half now, so they are cleared once, as the window starts.
export function forgetOldChartPrefs(store: Store | null = local()): void {
  for (const key of OLD_KEYS) write(key, null, store)
}

export function sidebarHidden(store: Store | null = local()): boolean {
  return read(KEYS.sidebar, store) === '1'
}

export function setSidebarHidden(hidden: boolean, store: Store | null = local()): void {
  write(KEYS.sidebar, hidden ? '1' : null, store)
}
