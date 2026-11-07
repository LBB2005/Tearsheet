import { describe, expect, it } from 'vitest'

import { forgetOldChartPrefs, setSidebarHidden, setStartRange, setVolumeOn, setVolumeShare, sidebarHidden, startRange, volumeOn, volumeShare } from './prefs'

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

  it('keeps the volume’s share of the chart’s height, and falls back on a bad one', () => {
    const s = fake()
    expect(volumeShare(s)).toBe(0.1)
    setVolumeShare(0.234, s)
    expect(volumeShare(s)).toBe(0.234)
    for (const bad of ['2', 'x', '0', '-0.1']) {
      s.m.set('chart.volumeShare', bad)
      expect(volumeShare(s)).toBe(0.1)
    }
  })

  it('keeps whether the volume is shown, on unless it was turned off', () => {
    const s = fake()
    expect(volumeOn(s)).toBe(true)
    setVolumeOn(false, s)
    expect(s.m.get('chart.volume')).toBe('0')
    expect(volumeOn(s)).toBe(false)
    setVolumeOn(true, s)
    expect(volumeOn(s)).toBe(true)
    s.m.set('chart.volume', 'maybe')
    expect(volumeOn(s)).toBe(true)
  })

  it('keeps the range the chart opens on: 1Y until another is picked', () => {
    const s = fake()
    expect(startRange(s)).toBe('1Y')
    setStartRange('3M', s)
    expect(startRange(s)).toBe('3M')
    setStartRange('All', s)
    expect(startRange(s)).toBe('All')
    s.m.set('chart.startRange', '1D')
    expect(startRange(s)).toBe('1Y')
    expect(startRange(null)).toBe('1Y')
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
