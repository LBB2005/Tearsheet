// The look's CSS names (tokens.ts) against the stylesheets that use them. Three promises are held
// here: the default look draws exactly what the window was designed with; every look, dark or
// light, sets every colour name, so nothing of the dark default shows through a light look; and
// no colour is typed into a rule, so every colour on screen can follow the look.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, test } from 'vitest'

import { contrast, luminance, mix } from './colour'
import { FONTS, LOOKS, PLAIN_STYLE, RATINGS, styleOf } from './looks'
import { CORNERS, DEFAULT_APPEARANCE, GLOW, type Appearance } from './themeFile'
import { EXACT, LIGHT_FLOOR, num, pickerValue, readability, resolve, SIDEBAR_LIFT, TOKEN_NAMES } from './tokens'

const RENDERER = new URL('..', import.meta.url).pathname
const css = (path: string) => readFileSync(join(RENDERER, path), 'utf8')
const TEMPLATE = readFileSync(new URL('../../../../engine/src/tearsheet/templates/report.html.j2', import.meta.url), 'utf8')

// The names declared in a stylesheet's first :root block, with their values.
function rootTokens(text: string): Map<string, string> {
  const start = text.indexOf(':root {')
  const block = text.slice(start, text.indexOf('}', start))
  return new Map([...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}

// Values compared as the browser reads them: case and spaces in colours, and numbers by value.
const same = (a: string, b: string) => {
  const norm = (v: string) => v.replace(/\s+/g, ' ').replace(/\(\s*/g, '(').replace(/\s*,\s*/g, ',').toUpperCase()
  if (/^-?[\d.]+$/.test(a) && /^-?[\d.]+$/.test(b)) return Number(a) === Number(b)
  return norm(a) === norm(b)
}

const STYLES = rootTokens(css('styles.css'))

// The names in styles.css :root that are not a look's own: worked out from the others in the CSS
// (--panel, --line, --track, --chipline, --r, --c-co, --c-peer), or not about colour.
const NOT_LOOK = new Set(['--panel', '--line', '--track', '--chipline', '--r', '--c-co', '--c-peer', '--sw', '--settle', '--slide', '--mono'])

describe('the default look', () => {
  test('sets every name to exactly the value styles.css was designed with', () => {
    const { tokens } = resolve(DEFAULT_APPEARANCE)
    for (const [name, value] of STYLES) {
      if (NOT_LOOK.has(name)) continue
      expect(tokens[name], name).toBeDefined()
      expect(same(tokens[name], value), `${name}: ${tokens[name]} vs ${value}`).toBe(true)
    }
  })

  test('leaves the panels, the chart’s lines and the lines to the CSS’s own sums', () => {
    const { tokens } = resolve(DEFAULT_APPEARANCE)
    for (const name of ['--panel', '--c-co', '--c-peer']) expect(tokens[name]).toBeUndefined()
    expect(STYLES.get('--panel')).toBe('rgb(var(--ink) / var(--panel-a))')
    expect(STYLES.get('--c-co')).toBe('var(--accent)')
  })

  test('glows at 40% of the first strength, Liam’s pick', () => {
    expect(STYLES.get('--glow')).toBe('.4')
    expect(resolve(DEFAULT_APPEARANCE).tokens['--glow']).toBe('.4')
  })

  test('matches the report page’s own names, apart from the glow a report file keeps at full', () => {
    const report = rootTokens(TEMPLATE)
    const { tokens } = resolve(DEFAULT_APPEARANCE)
    for (const [name, value] of report) {
      if (NOT_LOOK.has(name) || ['--band', '--num'].includes(name)) continue
      if (name === '--glow') {
        expect(value).toBe('1')
        continue
      }
      expect(tokens[name], name).toBeDefined()
      expect(same(tokens[name], value), `${name}: ${tokens[name]} vs ${value}`).toBe(true)
    }
  })

  test('keeps every designed value it lists', () => {
    const { tokens } = resolve(DEFAULT_APPEARANCE)
    for (const [name, value] of Object.entries(EXACT)) expect(tokens[name], name).toBe(value)
  })
})

describe('every look', () => {
  const looks: [string, Appearance][] = LOOKS.flatMap((l) => (['dark', 'light'] as const).map((mode): [string, Appearance] => [`${l.name} ${mode}`, { ...DEFAULT_APPEARANCE, basedOn: l.id, mode }]))

  test.each(looks)('%s sets every colour name in styles.css', (_name, look) => {
    const { tokens } = resolve(look)
    for (const name of STYLES.keys()) if (!NOT_LOOK.has(name)) expect(tokens[name], name).toBeDefined()
    for (const name of Object.keys(tokens)) expect(TOKEN_NAMES, name).toContain(name)
  })

  test.each(looks)('%s is easy to read', (_name, look) => {
    for (const r of readability(resolve(look))) expect(r.ok, `${r.what} ${r.ratio.toFixed(2)}`).toBe(true)
  })

  // Sidebar prices, shortcut hints, counts and placeholders use these quieter greys.
  test.each(LOOKS.map((l) => [l.name, l.id]))('%s in light mode keeps its quieter greys readable on the page and the sidebar', (_name, id) => {
    const r = resolve({ ...DEFAULT_APPEARANCE, basedOn: id, mode: 'light' })
    for (const [name, min] of Object.entries(LIGHT_FLOOR)) {
      expect(contrast(r.tokens[name], r.colours.base), `${name} on the page`).toBeGreaterThanOrEqual(min)
      expect(contrast(r.tokens[name], r.side), `${name} on the sidebar`).toBeGreaterThanOrEqual(min)
    }
  })

  test.each(looks)('%s keeps the Buy, Hold and Sell colours readable on its background', (_name, look) => {
    for (const set of RATINGS) {
      const r = resolve({ ...look, ratings: set.id })
      for (const c of [r.colours.up, r.colours.hold, r.colours.down]) expect(contrast(c, r.colours.base), `${set.id} ${c}`).toBeGreaterThanOrEqual(3)
    }
  })

  test('a light look draws dark text on a light ground with dark lines', () => {
    const r = resolve({ ...DEFAULT_APPEARANCE, mode: 'light' })
    expect(r.shade).toBe('light')
    expect(r.tokens['--ink']).toBe('14 23 38')
    expect(r.tokens['--shade-k']).toBe('.35')
    expect(contrast(r.colours.text, r.colours.base)).toBeGreaterThan(12)
    expect(r.background).toBe('#E8EDF2')
  })
})

describe('the choices', () => {
  test('Match the Mac follows the Mac', () => {
    expect(resolve({ ...DEFAULT_APPEARANCE, mode: 'auto' }, true).shade).toBe('dark')
    expect(resolve({ ...DEFAULT_APPEARANCE, mode: 'auto' }, false).shade).toBe('light')
  })

  test('an accent swatch has a dark and a light version', () => {
    expect(resolve({ ...DEFAULT_APPEARANCE, accent: 'pink' }).tokens['--accent']).toBe('#FF9EC7')
    expect(resolve({ ...DEFAULT_APPEARANCE, accent: 'pink', mode: 'light' }).tokens['--accent']).toBe('#B8326E')
  })

  test('a new accent works out its own shades and leaves the designed greys alone', () => {
    const { tokens } = resolve({ ...DEFAULT_APPEARANCE, colours: { accent: '#FF9EC7' } })
    expect(tokens['--accent']).toBe('#FF9EC7')
    expect(tokens['--accent-text']).not.toBe(EXACT['--accent-text'])
    expect(tokens['--text2']).toBe(EXACT['--text2'])
    expect(tokens['--menu-bg']).toBe(EXACT['--menu-bg'])
  })

  test('colours set one by one replace the look’s', () => {
    const r = resolve({ ...DEFAULT_APPEARANCE, colours: { background: '#101010', sidebar: '#202020', text: '#F0F0F0', 'secondary-text': '#A0A0A0', 'second-accent': '#FFAA00', 'glow-1': '#FF0000' } })
    expect(r.tokens['--base']).toBe('#101010')
    expect(r.tokens['--bg']).toBe('#202020')
    // A sidebar colour picked by hand is drawn exactly as picked, with no lift.
    expect(r.tokens['--side']).toBe('#202020')
    expect(pickerValue(r, 'sidebar')).toBe('#202020')
    expect(r.tokens['--text']).toBe('#F0F0F0')
    expect(r.tokens['--muted']).toBe('#A0A0A0')
    expect(r.tokens['--accent2']).toBe('#FFAA00')
    expect(r.tokens['--g1']).toBe('255 0 0')
    // The greys come from the new colours now, not the designed ones.
    expect(r.tokens['--text2']).not.toBe(EXACT['--text2'])
    expect(r.background).toBe('#202020')
  })

  test('the chart’s three lines can be their own colours', () => {
    const plain = resolve(DEFAULT_APPEARANCE)
    expect(plain.chart).toEqual({ company: '#7FE3F7', peers: '#8FA2FF', spy: '#D8DCE6' })
    const r = resolve({ ...DEFAULT_APPEARANCE, colours: { 'chart-company': '#FFFFFF', 'chart-peers': '#00FF00', 'chart-sp500': '#777777' } })
    expect(r.tokens['--c-co']).toBe('#FFFFFF')
    expect(r.tokens['--c-peer']).toBe('#00FF00')
    expect(r.tokens['--c-spy']).toBe('#777777')
    expect(pickerValue(r, 'chart-peers')).toBe('#00FF00')
  })

  test('the Buy, Hold and Sell sets', () => {
    const r = resolve({ ...DEFAULT_APPEARANCE, ratings: 'colourblind' })
    expect([r.tokens['--up'], r.tokens['--hold'], r.tokens['--down']]).toEqual(['#5AB4FF', '#F0D46A', '#FF9F45'])
    // Red text for what went wrong follows the set's down colour.
    expect(r.tokens['--bad-text']).not.toBe(EXACT['--bad-text'])
  })

  test('glow, boldness, corners, glass, lines and font', () => {
    const r = resolve({ ...DEFAULT_APPEARANCE, glow: 0, boldness: 100, corners: 7, glass: 'solid', lines: 'strong', font: 'ny', size: 115 })
    expect(r.tokens['--glow']).toBe('0')
    expect(r.tokens['--wt']).toBe('100')
    expect(r.tokens['--round']).toBe('.5')
    expect(r.tokens['--frost']).toBe('0')
    expect(r.tokens['--panel']).toMatch(/^#[0-9A-F]{6}$/)
    expect(r.tokens['--line-a']).toBe('.2')
    expect(r.tokens['--ui']).toContain('New York')
    expect(r.zoom).toBe(1.15)
    expect(resolve({ ...DEFAULT_APPEARANCE, glass: 'clear' }).tokens['--panel-a']).toBe('.02')
  })

  test('a look made hard to read says which part and by how much', () => {
    const bad = readability(resolve({ ...DEFAULT_APPEARANCE, colours: { 'secondary-text': '#20242C' } })).filter((r) => !r.ok)
    expect(bad.map((r) => r.what)).toEqual(['Secondary text'])
    expect(bad[0].ratio).toBeLessThan(2)
  })

  test('numbers are written as the CSS writes them', () => {
    expect([num(0.4), num(1), num(0), num(0.55), num(-0.5), num(22 / 14)]).toEqual(['.4', '1', '0', '.55', '-.5', '1.5714'])
  })
})

describe('the Raised sidebar (Liam’s pick of five, 8 Nov 2026)', () => {
  test('lifts the sidebar 7.5% toward the text by default, and leaves the window’s own colour', () => {
    const r = resolve(DEFAULT_APPEARANCE)
    expect(DEFAULT_APPEARANCE.sidebarContrast).toBe(50)
    expect(r.tokens['--side']).toBe('#1B1E25')
    expect(r.side).toBe('#1B1E25')
    expect(r.tokens['--bg']).toBe('#0A0D14')
    expect(r.background).toBe('#0A0D14')
    // About 18% apart from the page, where it was 1%.
    expect(contrast(r.side, r.colours.base)).toBeGreaterThan(1.15)
    expect(contrast(r.colours.bg, r.colours.base)).toBeLessThan(1.02)
  })

  test('0% is the flat sidebar from before, 100% twice the lift', () => {
    expect(resolve({ ...DEFAULT_APPEARANCE, sidebarContrast: 0 }).tokens['--side']).toBe('#0A0D14')
    expect(resolve({ ...DEFAULT_APPEARANCE, sidebarContrast: 100 }).tokens['--side']).toBe(mix('#0A0D14', '#EAF1F7', 100 * SIDEBAR_LIFT))
  })

  test('light mode keeps its grey sidebar on a white page', () => {
    const r = resolve({ ...DEFAULT_APPEARANCE, mode: 'light', sidebarContrast: 100 })
    expect(r.tokens['--side']).toBe('#E8EDF2')
  })

  test('the colour picker shows the sidebar as drawn, and readability checks it', () => {
    const r = resolve(DEFAULT_APPEARANCE)
    expect(pickerValue(r, 'sidebar')).toBe('#1B1E25')
    const sidebar = readability(r).find((x) => x.what === 'Text in the sidebar')
    expect(sidebar?.ratio).toBeCloseTo(contrast('#EAF1F7', '#1B1E25'), 5)
  })

  test.each(LOOKS.map((l) => [l.name, l.id] as const))('%s stays easy to read with the sidebar at full lift, and stands apart at 50%', (_name, id) => {
    const full = resolve({ ...DEFAULT_APPEARANCE, basedOn: id, sidebarContrast: 100 })
    expect(contrast(full.colours.text, full.side)).toBeGreaterThanOrEqual(4.5)
    // The sidebar's small labels (Pinned, Today) are the secondary text a step dimmer.
    expect(contrast(full.tokens['--faint2'], full.side)).toBeGreaterThanOrEqual(3.5)
    for (const c of [full.colours.up, full.colours.hold, full.colours.down]) expect(contrast(c, full.side)).toBeGreaterThanOrEqual(3)
    const half = resolve({ ...DEFAULT_APPEARANCE, basedOn: id })
    expect(contrast(half.side, half.colours.base)).toBeGreaterThanOrEqual(1.08)
  })
})

describe('the More looks (8 Nov 2026)', () => {
  test('twenty, after the first six, each with its own font, corners and glow', () => {
    const more = LOOKS.filter((l) => l.more)
    expect(more).toHaveLength(20)
    expect(LOOKS.slice(0, 6).every((l) => !l.more && !l.style)).toBe(true)
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length)
    expect(new Set(LOOKS.map((l) => l.name)).size).toBe(LOOKS.length)
    for (const l of more) {
      expect(FONTS.map((f) => f.id), l.name).toContain(l.style?.font)
      expect(l.style!.corners).toBeGreaterThanOrEqual(CORNERS.min)
      expect(l.style!.corners).toBeLessThanOrEqual(CORNERS.max)
      expect(l.style!.glow % GLOW.step).toBe(0)
      for (const shade of ['dark', 'light'] as const) for (const v of Object.values(l[shade])) expect(v, `${l.name} ${shade}`).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  test('the six first come with today’s font, corners and glow, the default’s', () => {
    expect(styleOf(LOOKS[0])).toEqual(PLAIN_STYLE)
    expect([DEFAULT_APPEARANCE.font, DEFAULT_APPEARANCE.corners, DEFAULT_APPEARANCE.glow]).toEqual([PLAIN_STYLE.font, PLAIN_STYLE.corners, PLAIN_STYLE.glow])
  })

  test('a light look keeps its sidebar darker than its page', () => {
    for (const l of LOOKS.filter((x) => x.more)) expect(luminance(l.light.bg), l.name).toBeLessThan(luminance(l.light.base))
  })
})

describe('no colour is typed into a rule', () => {
  const sheets = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sheets(join(dir, d.name)) : d.name.endsWith('.css') ? [relative(RENDERER, join(dir, d.name))] : []))
  const literal = /#[0-9A-Fa-f]{3,8}\b|rgba?\(\s*\d/g
  const outsideRoot = (text: string) => {
    const start = text.indexOf(':root {')
    return start < 0 ? text : text.slice(0, start) + text.slice(text.indexOf('}', start) + 1)
  }

  test.each(sheets(RENDERER))('%s', (sheet) => {
    expect(outsideRoot(css(sheet)).replace(/\/\*[\s\S]*?\*\//g, '').match(literal)).toBeNull()
  })

  test('the chart draws its lines in the names, not in hex', () => {
    expect(css('chart/ChartPane.tsx').match(/#[0-9A-Fa-f]{6}\b/g)).toBeNull()
  })

  test('nor into the report page, whose every name is declared at its top', () => {
    const style = TEMPLATE.slice(TEMPLATE.indexOf('<style>'), TEMPLATE.indexOf('</style>'))
    expect(outsideRoot(style).replace(/\/\*[\s\S]*?\*\//g, '').match(literal)).toBeNull()
    const declared = rootTokens(TEMPLATE)
    const used = new Set([...TEMPLATE.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))
    // The report's own names for its charts and readouts are set where they're used.
    const local = new Set([...TEMPLATE.matchAll(/(?:^|[;{\s"])(--[\w-]+)\s*:/g)].map((m) => m[1]))
    for (const name of used) expect(declared.has(name) || local.has(name), name).toBe(true)
  })
})
