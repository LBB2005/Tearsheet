import { describe, expect, it } from 'vitest'

import { forgetOldChartPrefs, setSidebarHidden, sidebarHidden } from './prefs'

const fake = () => {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('prefs', () => {
  it('forgets the old opening width and the Settings choice it came from', () => {
    const s = fake()
    s.m.set('chart.opens', 'last')
    s.m.set('chart.lastWidth', '612')
    s.m.set('sidebar.hidden', '1')
    forgetOldChartPrefs(s)
    expect([...s.m.keys()]).toEqual(['sidebar.hidden'])
  })

  it('keeps whether the sidebar is hidden', () => {
    const s = fake()
    expect(sidebarHidden(s)).toBe(false)
    setSidebarHidden(true, s)
    expect(sidebarHidden(s)).toBe(true)
    setSidebarHidden(false, s)
    expect(sidebarHidden(s)).toBe(false)
  })

  it('falls back to the defaults without a storage', () => {
    expect(sidebarHidden(null)).toBe(false)
  })
})
