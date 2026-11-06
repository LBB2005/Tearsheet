import { describe, expect, it } from 'vitest'

import { fillForSteps, markSvg } from './drawing'

describe('the Glass mark', () => {
  it('fillForSteps counts done steps out of 14', () => {
    expect(fillForSteps({ resolve: 'done', fetch: 'done' })).toBeCloseTo(2 / 14)
  })
  it('fillForSteps is 0 with nothing done', () => {
    expect(fillForSteps({})).toBe(0)
  })
  it('markSvg without fill has no dash offset', () => {
    expect(markSvg({})).not.toContain('stroke-dashoffset')
  })
  it('markSvg fill 0.5 sets offset 0.5', () => {
    expect(markSvg({ fill: 0.5 })).toContain('stroke-dashoffset="0.500"')
  })
  it('small drawing has one grey line', () => {
    expect(markSvg({ small: true }).match(/#7487A0/g)).toHaveLength(1)
  })
  it('full drawing has two grey lines', () => {
    expect(markSvg({}).match(/#7487A0/g)).toHaveLength(2)
  })
  it('gives each instance its own gradient ids', () => {
    expect(markSvg({ id: 'a' })).toContain('id="a-b"')
    expect(markSvg({ id: 'b' })).not.toContain('id="a-b"')
  })
  it('clamps fill to 0–1', () => {
    expect(markSvg({ fill: -1 })).toContain('stroke-dashoffset="1.000"')
    expect(markSvg({ fill: 2 })).toContain('stroke-dashoffset="0.000"')
  })
  it('treats a non-finite fill as 0', () => {
    expect(markSvg({ fill: NaN })).toContain('stroke-dashoffset="1.000"')
    expect(markSvg({ fill: NaN })).not.toContain('NaN')
  })
  it('area opacity follows fill', () => {
    expect(markSvg({ fill: 0.25 })).toContain('opacity="0.250"')
    expect(markSvg({})).not.toContain('mark-area')
  })
})
