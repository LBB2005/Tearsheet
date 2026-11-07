import { describe, expect, it } from 'vitest'

import { markReportSeen, motionLevel, pageEntrance, pageLeaveMs, reportEntrance, setMotionLevel } from './motion'

const fake = () => {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

const root = () => {
  const attrs = new Map<string, string>()
  return { attrs, setAttribute: (k: string, v: string) => void attrs.set(k, v) }
}

describe('the motion level', () => {
  it('is Subtle until another is chosen, and falls back on Subtle for a value it doesn’t know', () => {
    const s = fake()
    expect(motionLevel(s)).toBe('subtle')
    s.m.set('motion.level', 'wild')
    expect(motionLevel(s)).toBe('subtle')
  })

  it('keeps the choice and puts it on the page for the CSS', () => {
    const s = fake()
    const r = root()
    setMotionLevel('off', s, r)
    expect(motionLevel(s)).toBe('off')
    expect(r.attrs.get('data-motion')).toBe('off')
    setMotionLevel('full', s, r)
    expect(motionLevel(s)).toBe('full')
    expect(r.attrs.get('data-motion')).toBe('full')
  })
})

describe('a report’s entrance', () => {
  it('plays the first time a report is opened, then doesn’t', () => {
    const s = fake()
    expect(reportEntrance('r1', 'subtle', s)).toBe(true)
    markReportSeen('r1', s)
    expect(reportEntrance('r1', 'subtle', s)).toBe(false)
    expect(reportEntrance('r2', 'subtle', s)).toBe(true)
  })

  it('is remembered between launches', () => {
    const s = fake()
    markReportSeen('r1', s)
    // A new launch reads the same storage.
    expect(reportEntrance('r1', 'subtle', s)).toBe(false)
  })

  it('plays every time under Full, and never under Off', () => {
    const s = fake()
    markReportSeen('r1', s)
    expect(reportEntrance('r1', 'full', s)).toBe(true)
    expect(reportEntrance('r2', 'off', s)).toBe(false)
  })

  it('keeps a bounded list, newest kept', () => {
    const s = fake()
    for (let i = 0; i < 600; i++) markReportSeen(`r${i}`, s)
    expect(reportEntrance('r599', 'subtle', s)).toBe(false)
    expect(reportEntrance('r0', 'subtle', s)).toBe(true)
    markReportSeen('r599', s)
    expect(JSON.parse(s.m.get('motion.seenReports') ?? '[]')).toHaveLength(500)
  })

  it('starts again from nothing when the list can’t be read', () => {
    const s = fake()
    s.m.set('motion.seenReports', 'not json')
    expect(reportEntrance('r1', 'subtle', s)).toBe(true)
    markReportSeen('r1', s)
    expect(reportEntrance('r1', 'subtle', s)).toBe(false)
  })
})

describe('a page’s entrance', () => {
  it('builds up the home page once a launch, and fades every other page in', () => {
    const seen = new Set<string>()
    expect(pageEntrance('home', 'subtle', seen)).toBe(true)
    expect(pageEntrance('settings', 'subtle', seen)).toBe(false)
    expect(pageEntrance('home', 'subtle', seen)).toBe(false)
    expect(pageEntrance('home-run', 'subtle', seen)).toBe(false)
  })

  it('builds up every page under Full, and none under Off', () => {
    const seen = new Set<string>()
    expect(pageEntrance('log', 'full', seen)).toBe(true)
    expect(pageEntrance('log', 'full', seen)).toBe(true)
    expect(pageEntrance('home', 'off', new Set())).toBe(false)
  })

  it('leaves at once under Subtle and Off; Full keeps the old fade and lift', () => {
    expect(pageLeaveMs('subtle')).toBe(0)
    expect(pageLeaveMs('off')).toBe(0)
    expect(pageLeaveMs('full')).toBe(240)
  })
})
