import { describe, expect, it } from 'vitest'

import { textFrames } from './frames'

const A = { key: 'a', html: '<p>A</p>' }
const B = { key: 'b', html: '<p>B</p>' }

describe('textFrames', () => {
  it('shows nothing before the first report arrives, then that one', () => {
    expect(textFrames(null, null, false)).toEqual([])
    expect(textFrames(A, null, false)).toEqual([A])
  })

  it('keeps the report on show while another loads, so the area never goes blank', () => {
    expect(textFrames(null, A, false)).toEqual([A])
  })

  it('puts the new frame after the old one, so the old one never moves in the page', () => {
    expect(textFrames(B, A, false)).toEqual([A, B])
  })

  it('drops the old frame once the new one is on show', () => {
    expect(textFrames(B, B, false)).toEqual([B])
  })

  it('drops the old report when the new one didn’t load', () => {
    expect(textFrames(null, A, true)).toEqual([])
    expect(textFrames(B, A, true)).toEqual([B])
  })
})
