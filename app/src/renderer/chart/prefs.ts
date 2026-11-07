// The window's own small preferences, kept in localStorage:
//   sidebar.hidden      '1' while the sidebar is hidden (⌃⌘S).
//   chart.volumeShare   the volume bars' share of the chart's height (chart/height.ts).
//   chart.volume        '0' while the chart's Volume toggle is off.
// A storage that can't be read or written (it shouldn't happen in the app) falls back to the
// defaults.

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

import { SHARE_DEFAULT } from './height'

const KEYS = { sidebar: 'sidebar.hidden', volumeShare: 'chart.volumeShare', volume: 'chart.volume' } as const
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

export function volumeShare(store: Store | null = local()): number {
  const n = Number(read(KEYS.volumeShare, store) ?? NaN)
  return n > 0 && n < 1 ? n : SHARE_DEFAULT
}

export function setVolumeShare(share: number, store: Store | null = local()): void {
  write(KEYS.volumeShare, String(Math.round(share * 1000) / 1000), store)
}

export function volumeOn(store: Store | null = local()): boolean {
  return read(KEYS.volume, store) !== '0'
}

export function setVolumeOn(on: boolean, store: Store | null = local()): void {
  write(KEYS.volume, on ? null : '0', store)
}
