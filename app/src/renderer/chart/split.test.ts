import { describe, expect, it } from 'vitest'

import { CHART_MIN, DIV, fitsBeside, presetSplit, snapWidth, splitWidth, TEXT_MIN } from './split'

// A 1,280 px window with the 232 px sidebar shown.
const AVAIL = 1280 - 232

describe('snapWidth', () => {
  it('snaps to half within the band around it', () => {
    for (const raw of [524 - 10, 524, 524 + 10]) expect(snapWidth(raw, AVAIL)).toEqual({ width: 524, mode: 'half', label: 'Half' })
  })

  it('follows the drag between the snaps', () => {
    expect(snapWidth(700, AVAIL)).toEqual({ width: 700, mode: 'free', label: null })
  })

  it('stops at the report’s limit and asks to drag further for full', () => {
    expect(snapWidth(AVAIL - TEXT_MIN - DIV + 10, AVAIL)).toMatchObject({ width: 700, label: 'Drag further for full' })
  })

  it('goes to full past the limit by more than the overshoot', () => {
    expect(snapWidth(AVAIL - TEXT_MIN - DIV + 31 + 1, AVAIL)).toMatchObject({ mode: 'full', width: 1048 })
    expect(snapWidth(AVAIL - TEXT_MIN - DIV + 31 + 1, AVAIL).label).toBe('Full')
  })

  it('never goes narrower than the chart’s limit', () => {
    expect(snapWidth(200, AVAIL)).toEqual({ width: 360, mode: 'min', label: 'Narrowest' })
  })

  it('gives the whole width when the window is too narrow for both', () => {
    expect(snapWidth(500, 650)).toEqual({ width: 650, mode: 'full', label: 'Full' })
  })

  it('is never negative and never wider than the space', () => {
    expect(snapWidth(-50, AVAIL).width).toBe(360)
    expect(snapWidth(5000, AVAIL).width).toBe(AVAIL)
    expect(snapWidth(-50, 0).width).toBe(0)
  })
})

describe('presetSplit', () => {
  it('gives Narrow a third, Half a half and Wide two thirds of the space', () => {
    expect(presetSplit('narrow', 1200)).toEqual({ mode: 'narrow', width: 400 })
    expect(presetSplit('half', 1200)).toEqual({ mode: 'half', width: 600 })
    expect(presetSplit('wide', 1200)).toEqual({ mode: 'wide', width: 800 })
    expect(presetSplit('full', 1200)).toEqual({ mode: 'full', width: 1200 })
  })

  it('keeps each preset inside the chart’s and the report’s limits', () => {
    expect(presetSplit('narrow', 900)).toEqual({ mode: 'narrow', width: CHART_MIN })
    expect(presetSplit('half', 900)).toEqual({ mode: 'half', width: 450 })
    expect(presetSplit('wide', 900)).toEqual({ mode: 'wide', width: 900 - TEXT_MIN - DIV })
  })

  it('gives the whole width when the window is too narrow for both', () => {
    for (const p of ['narrow', 'half', 'wide', 'full'] as const) expect(presetSplit(p, 700)).toEqual({ mode: 'full', width: 700 })
  })
})

describe('splitWidth', () => {
  it('keeps Narrow and Wide as the space changes', () => {
    expect(splitWidth({ mode: 'wide', width: 800 }, 900)).toBe(552)
    expect(splitWidth({ mode: 'wide', width: 552 }, 1200)).toBe(800)
    expect(splitWidth({ mode: 'narrow', width: 400 }, 900)).toBe(CHART_MIN)
  })

  it('keeps half and full as the space changes', () => {
    expect(splitWidth({ mode: 'half', width: 524 }, 1280)).toBe(640)
    expect(splitWidth({ mode: 'full', width: 1048 }, 1280)).toBe(1280)
  })

  it('keeps a dragged width inside both limits as the space changes', () => {
    expect(splitWidth({ mode: 'free', width: 900 }, AVAIL)).toBe(AVAIL - TEXT_MIN - DIV)
    expect(splitWidth({ mode: 'min', width: 300 }, AVAIL)).toBe(CHART_MIN)
    expect(splitWidth({ mode: 'free', width: 600 }, 650)).toBe(650)
  })

  it('keeps half inside the limits in the narrowest split', () => {
    const avail = CHART_MIN + TEXT_MIN + DIV + 4
    const half = splitWidth({ mode: 'half', width: 0 }, avail)
    expect(half).toBeGreaterThanOrEqual(CHART_MIN)
    expect(avail - half - DIV).toBeGreaterThanOrEqual(TEXT_MIN)
  })
})

describe('fitsBeside', () => {
  it('fits the chart beside the report down to both their limits', () => {
    expect(fitsBeside(CHART_MIN + TEXT_MIN + DIV)).toBe(true)
    expect(fitsBeside(CHART_MIN + TEXT_MIN + DIV - 1)).toBe(false)
  })

  it('fits in every window Tearsheet allows, so a narrow window keeps the split', () => {
    // The narrowest window (820 px, main/index.ts), with the sidebar over the page.
    expect(fitsBeside(820)).toBe(true)
    // The narrowest wide window (1,100 px) beside the widest sidebar (360 px).
    expect(fitsBeside(1100 - 360)).toBe(true)
  })
})

describe('the split as the window changes', () => {
  it('keeps Half at half, frame by frame, as a window is dragged across 1,100 px', () => {
    for (let avail = 1048; avail >= 820; avail -= 4) {
      const w = splitWidth({ mode: 'half', width: 524 }, avail)
      expect(Math.abs(w - avail / 2)).toBeLessThanOrEqual(0.5)
    }
  })
})
