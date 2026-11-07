import { describe, expect, it } from 'vitest'

import { PRICE_MIN, SHARE_DEFAULT, shareFor, VOL_MIN, volumeHeight } from './height'

describe('volumeHeight', () => {
  it('gives the volume its share of the plot', () => {
    expect(SHARE_DEFAULT).toBe(0.1)
    expect(volumeHeight(0.1, 500, true)).toBe(50)
  })

  it('always leaves the price chart room for two axis labels', () => {
    expect(PRICE_MIN).toBe(90)
    expect(volumeHeight(0.9, 500, true)).toBe(500 - PRICE_MIN)
  })

  it('never makes the bars too short to read', () => {
    expect(VOL_MIN).toBe(24)
    expect(volumeHeight(0.01, 500, true)).toBe(VOL_MIN)
  })

  it('gives the price chart first claim on a plot too short for both', () => {
    expect(volumeHeight(0.1, 100, true)).toBe(10)
    expect(volumeHeight(0.5, 60, true)).toBe(0)
  })

  it('is nothing with the volume off', () => {
    expect(volumeHeight(0.5, 400, false)).toBe(0)
  })
})

describe('shareFor', () => {
  it('turns a dragged height back into a share', () => {
    expect(shareFor(50, 500)).toBe(0.1)
    expect(shareFor(50, 0)).toBe(SHARE_DEFAULT)
  })
})
