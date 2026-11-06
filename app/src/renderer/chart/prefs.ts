// The window's own small preferences, kept in localStorage:
//   chart.opens      the Settings choice "When the chart opens": 'full', 'half' or 'last'
//                    (Where I left it, the default). Settings writes it; the chart reads it.
//   chart.lastWidth  where the chart was left: 'full', or a width in px. No entry means Half.
//   sidebar.hidden   '1' while the sidebar is hidden (⌃⌘S).
// A storage that can't be read or written (it shouldn't happen in the app) falls back to the
// defaults.

import type { ChartOpens, Split } from './split'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEYS = { opens: 'chart.opens', lastWidth: 'chart.lastWidth', sidebar: 'sidebar.hidden' } as const

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

export function chartOpens(store: Store | null = local()): ChartOpens {
  const v = read(KEYS.opens, store)
  return v === 'full' || v === 'half' ? v : 'last'
}

export function setChartOpens(value: ChartOpens, store: Store | null = local()): void {
  write(KEYS.opens, value, store)
}

// The width the chart was left at, as split.ts's openWidth takes it: null for Half or nothing
// kept, Infinity for Full, else the width in px.
export function lastWidth(store: Store | null = local()): number | null {
  const v = read(KEYS.lastWidth, store)
  if (v === 'full') return Infinity
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function setLastWidth(split: Split, store: Store | null = local()): void {
  write(KEYS.lastWidth, split.mode === 'full' ? 'full' : split.mode === 'half' ? null : String(Math.round(split.width)), store)
}

export function sidebarHidden(store: Store | null = local()): boolean {
  return read(KEYS.sidebar, store) === '1'
}

export function setSidebarHidden(hidden: boolean, store: Store | null = local()): void {
  write(KEYS.sidebar, hidden ? '1' : null, store)
}
