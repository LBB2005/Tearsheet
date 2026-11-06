import { describe, expect, it } from 'vitest'

import { chartOpens, lastWidth, setChartOpens, setLastWidth, setSidebarHidden, sidebarHidden } from './prefs'

const fake = () => {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('prefs', () => {
  it('opens where it was left by default, and keeps the Settings choice', () => {
    const s = fake()
    expect(chartOpens(s)).toBe('last')
    setChartOpens('full', s)
    expect(chartOpens(s)).toBe('full')
    s.m.set('chart.opens', 'sideways')
    expect(chartOpens(s)).toBe('last')
  })

  it('keeps the last width: Half as nothing, Full as Infinity, else the px', () => {
    const s = fake()
    expect(lastWidth(s)).toBeNull()
    setLastWidth({ mode: 'free', width: 612.4 }, s)
    expect(lastWidth(s)).toBe(612)
    setLastWidth({ mode: 'full', width: 1048 }, s)
    expect(lastWidth(s)).toBe(Infinity)
    setLastWidth({ mode: 'half', width: 524 }, s)
    expect(s.m.has('chart.lastWidth')).toBe(false)
    s.m.set('chart.lastWidth', 'wide')
    expect(lastWidth(s)).toBeNull()
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
    expect(chartOpens(null)).toBe('last')
    expect(lastWidth(null)).toBeNull()
    expect(sidebarHidden(null)).toBe(false)
  })
})
