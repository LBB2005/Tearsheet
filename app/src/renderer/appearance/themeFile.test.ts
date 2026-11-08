// Theme files are other people's files. Only known settings with safe values get in; anything else
// is skipped and counted, and a file that isn't a theme changes nothing.

import { describe, expect, test } from 'vitest'

import { cleanName, DEFAULT_APPEARANCE, parseTheme, readTheme, sameLook, themeData, themeText, THEME_MAX_BYTES, type Appearance } from './themeFile'

const theme = (extra: Record<string, unknown>) => JSON.stringify({ 'tearsheet-theme': 1, name: 'Test', ...extra })
const ok = (text: string) => {
  const r = parseTheme(text)
  if (!r.ok) throw new Error(r.message)
  return r
}

const FULL: Appearance = {
  basedOn: 'dusk',
  mode: 'light',
  accent: 'pink',
  colours: { text: '#EFE9F7', 'chart-peers': '#00FF88', 'glow-2': '#112233' },
  font: 'sf',
  size: 110,
  boldness: 100,
  glow: 30,
  corners: 8,
  glass: 'solid',
  lines: 'strong',
  ratings: 'colourblind'
}

describe('a good file', () => {
  test('comes back as the look that was written', () => {
    const r = ok(themeText(FULL, 'Night shift'))
    expect(r.look).toEqual(FULL)
    expect(r.name).toBe('Night shift')
    expect(r.skipped).toBe(0)
  })

  test('is small, readable JSON with every setting named', () => {
    const data = themeData(DEFAULT_APPEARANCE, 'Mine')
    expect(Object.keys(data)).toEqual(['tearsheet-theme', 'name', 'based-on', 'mode', 'accent', 'text', 'glow', 'corners', 'glass', 'lines', 'ratings'])
    expect(themeText(DEFAULT_APPEARANCE, 'Mine').length).toBeLessThan(400)
    expect(themeData(DEFAULT_APPEARANCE, '').name).toBe('My look')
  })

  test('leaves out what it doesn’t name: today’s defaults fill the rest', () => {
    const r = ok(theme({ 'based-on': 'graphite' }))
    expect(r.look).toEqual({ ...DEFAULT_APPEARANCE, basedOn: 'graphite' })
  })

  test('may start with a byte-order mark, as some editors save', () => {
    expect(ok('﻿' + theme({ glow: 20 })).look.glow).toBe(20)
  })

  test('numbers between steps round to the nearest step', () => {
    const r = ok(theme({ glow: 42, text: { size: 103 }, corners: 7.6 }))
    expect([r.look.glow, r.look.size, r.look.corners]).toEqual([40, 105, 8])
  })

  test('sameLook compares every setting', () => {
    expect(sameLook(FULL, { ...FULL })).toBe(true)
    expect(sameLook(FULL, { ...FULL, glow: 35 })).toBe(false)
  })
})

describe('a file that isn’t a theme changes nothing', () => {
  test.each([
    ['not JSON', 'body { background: red }', 'couldn’t be read'],
    ['half a file', '{"tearsheet-theme": 1, "colours": {"accent": "#FF', 'couldn’t be read'],
    ['empty', '', 'couldn’t be read'],
    ['a list', '[1, 2, 3]', 'isn’t a Tearsheet theme'],
    ['a number', '42', 'isn’t a Tearsheet theme'],
    ['null', 'null', 'isn’t a Tearsheet theme'],
    ['no marker', '{"name": "Look", "glow": 10}', 'isn’t a Tearsheet theme'],
    ['the marker as text', '{"tearsheet-theme": "1"}', 'isn’t a Tearsheet theme'],
    ['version 0', '{"tearsheet-theme": 0}', 'isn’t a Tearsheet theme'],
    ['from a newer Tearsheet', '{"tearsheet-theme": 2, "glow": 10}', 'newer Tearsheet']
  ])('%s', (_what, text, says) => {
    const r = parseTheme(text)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain(says)
      expect(r.message).toContain('Nothing changed.')
    }
  })

  test('a file too big to be a theme is refused before it is read', () => {
    const r = parseTheme(theme({ pad: 'x'.repeat(THEME_MAX_BYTES) }))
    expect(r).toEqual({ ok: false, message: 'That file is too big to be a Tearsheet theme. Nothing changed.' })
  })
})

describe('a hostile file gets nothing but safe values in', () => {
  test.each([
    ['a colour name', 'red'],
    ['a short hex', '#FFF'],
    ['a hex with see-through', '#FF000080'],
    ['rgb()', 'rgb(1,2,3)'],
    ['a second declaration', '#FF0000; background: url(https://evil.example/x)'],
    ['a closed style tag', '#FF0000}</style><script>alert(1)</script>'],
    ['another name', 'var(--text)'],
    ['a space first', ' #FF0000'],
    ['not hex', '#GG0000'],
    ['a number', 12],
    ['null', null],
    ['a list', ['#FF0000']],
    ['an object', { hex: '#FF0000' }]
  ])('CSS in a colour is skipped: %s', (_what, value) => {
    const r = ok(theme({ colours: { text: value, accent: '#123456' } }))
    expect(r.look.colours).toEqual({ accent: '#123456' })
    expect(r.skipped).toBe(1)
  })

  test('a colour under a name that isn’t one of the twelve is skipped', () => {
    const r = ok(theme({ colours: { 'body-background': '#FFFFFF', TEXT: '#FFFFFF' } }))
    expect(r.look.colours).toEqual({})
    expect(r.skipped).toBe(2)
  })

  test('unknown settings, raw CSS and code are skipped and counted', () => {
    const r = ok(theme({ css: 'body { display: none }', script: 'alert(1)', html: '<img src=x onerror=alert(1)>', styles: { body: 'red' }, glow: 30 }))
    expect(r.skipped).toBe(4)
    expect(r.look).toEqual({ ...DEFAULT_APPEARANCE, glow: 30 })
  })

  test('choices must be one of the list', () => {
    const r = ok(theme({ 'based-on': 'solarized', mode: 'sepia', accent: 'chartreuse', glass: 'glass', lines: 'thick', ratings: 'rainbow', text: { font: 'Comic Sans; } body {', boldness: 300 } }))
    expect(r.look).toEqual(DEFAULT_APPEARANCE)
    expect(r.skipped).toBe(8)
  })

  test('numbers must be numbers, in range', () => {
    const r = ok(theme({ glow: 900, corners: -4, text: { size: '120', boldness: '100' } }))
    expect(r.look).toEqual(DEFAULT_APPEARANCE)
    expect(r.skipped).toBe(4)
    // JSON has no NaN, but 1e400 reads as Infinity.
    expect(ok('{"tearsheet-theme": 1, "glow": 1e400}').look.glow).toBe(DEFAULT_APPEARANCE.glow)
  })

  test('the wrong shape for a group is skipped as one part', () => {
    const r = ok(theme({ text: 'big', colours: ['#FFFFFF'] }))
    expect(r.skipped).toBe(2)
    expect(r.look).toEqual(DEFAULT_APPEARANCE)
  })

  test('__proto__ and constructor reach nothing', () => {
    const r = ok('{"tearsheet-theme": 1, "__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "colours": {"__proto__": "#FFFFFF"}, "text": {"__proto__": 1}}')
    expect(r.skipped).toBe(4)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(r.look.colours)).toBe(Object.prototype)
    expect(Object.keys(r.look.colours)).toEqual([])
  })

  test('the result has exactly the settings of a look and no more', () => {
    const r = ok(theme({ extra: 1, colours: { text: '#ABCDEF', bogus: '#000000' } }))
    expect(Object.keys(r.look).sort()).toEqual(Object.keys(DEFAULT_APPEARANCE).sort())
    expect(r.look.colours).toEqual({ text: '#ABCDEF' })
  })
})

describe('names', () => {
  test('lose control and direction-changing characters, and are kept short', () => {
    expect(cleanName('  Night\u0000 ‮shift​  ')).toBe('Night shift')
    expect(cleanName('x'.repeat(100))).toHaveLength(40)
    expect(cleanName(42)).toBe('')
    expect(cleanName(null)).toBe('')
  })

  test('a name is only text: markup in it stays text', () => {
    expect(ok(theme({ name: '<b>Bold</b> look' })).name).toBe('<b>Bold</b> look')
  })

  test('readTheme takes a parsed file directly', () => {
    expect(readTheme({ 'tearsheet-theme': 1, glow: 10 }).look.glow).toBe(10)
  })
})
