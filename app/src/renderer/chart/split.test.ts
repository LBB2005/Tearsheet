import { describe, expect, it } from 'vitest'

import { CHART_MIN, DIV, openSplit, openWidth, snapWidth, splitWidth, TEXT_MIN } from './split'

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

describe('openWidth', () => {
  it('opens at half when nothing is remembered', () => {
    expect(openWidth('last', null, AVAIL)).toBe(524)
  })

  it('opens full when Settings says so, whatever was last', () => {
    expect(openWidth('full', 600, AVAIL)).toBe(1048)
  })

  it('opens at the last width, fitted to the space there is now', () => {
    expect(openWidth('last', 900, 800)).toBe(snapWidth(900, 800).width)
    expect(openWidth('last', 600, AVAIL)).toBe(600)
  })

  it('opens at half when Settings says so', () => {
    expect(openWidth('half', 900, AVAIL)).toBe(524)
  })

  it('reopens full when it was left full', () => {
    expect(openWidth('last', Infinity, 1280)).toBe(1280)
  })
})

describe('openSplit and splitWidth', () => {
  it('remembers the snap it opened in', () => {
    expect(openSplit('full', null, AVAIL)).toEqual({ mode: 'full', width: AVAIL })
    expect(openSplit('last', null, AVAIL)).toEqual({ mode: 'half', width: 524 })
    expect(openSplit('last', 600, AVAIL)).toEqual({ mode: 'free', width: 600 })
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
