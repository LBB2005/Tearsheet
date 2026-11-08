// From a look (Appearance) to the CSS names the window draws with (styles.css :root). A look is
// made of a few colours (looks.ts Core); every other colour is worked out from them here, so a
// light look or a custom one sets every name and nothing of the dark default shows through. The
// dark Tearsheet look keeps the exact values the window was designed with (EXACT), so with no
// changes the window draws exactly as before; tokens.test.ts holds this file and styles.css to it.

import { contrast, luminance, mix, triple } from './colour'
import { ACCENTS, fontStack, lookById, LOOKS, RATINGS, type Core, type RatingColours, type Shade } from './looks'
import type { Appearance, ColourKey } from './themeFile'

type Inputs = Core & RatingColours

// The colour names worked out from a look, each from the colours it depends on.
interface Rule {
  deps: (keyof Inputs)[]
  make: (c: Inputs, shade: Shade) => string
}

const surface = (c: Inputs, shade: Shade) => (shade === 'dark' ? mix(c.base, c.ink, 0.075) : mix(c.base, '#FFFFFF', 0.85))
const onAccent = (accent: string, k: number) => (luminance(accent) > 0.3 ? mix(accent, '#000000', k) : '#FFFFFF')
const see = (hex: string, alpha: string) => `rgb(${triple(hex)} / ${alpha})`

const RULES: Record<string, Rule> = {
  '--shade': { deps: [], make: (_c, s) => (s === 'dark' ? '0 0 0' : '16 24 40') },
  '--shade-k': { deps: [], make: (_c, s) => (s === 'dark' ? '1' : '.35') },
  '--scrim': { deps: [], make: (_c, s) => (s === 'dark' ? '4 6 12' : '16 24 40') },
  '--surface': { deps: ['base', 'ink'], make: (c, s) => triple(surface(c, s)) },
  '--menu-bg': { deps: ['base', 'ink'], make: (c, s) => see(surface(c, s), '.97') },
  '--tip-bg': { deps: ['base', 'ink'], make: (c, s) => see(surface(c, s), '.94') },
  '--card-bg': { deps: ['base', 'ink'], make: (c, s) => see(surface(c, s), '.985') },
  '--option-bg': { deps: ['base', 'ink'], make: (c, s) => (s === 'dark' ? mix(c.base, c.ink, 0.09) : '#FFFFFF') },
  '--kbd-bg': { deps: ['base', 'ink'], make: (c) => mix(c.base, c.ink, 0.04) },
  '--veil': { deps: ['base'], make: (c) => see(c.base, '.55') },
  '--well-bg': { deps: ['base', 'ink'], make: (c) => see(mix(c.base, c.ink, 0.045), '.94') },
  '--well-bg2': { deps: ['base', 'ink'], make: (c) => see(mix(c.base, c.ink, 0.06), '.96') },
  '--readout': { deps: ['base', 'ink'], make: (c) => mix(c.base, c.ink, 0.05) },
  '--hi': { deps: ['ink'], make: (c) => c.ink },
  '--text3': { deps: ['muted', 'text'], make: (c) => mix(c.muted, c.text, 0.76) },
  '--text2': { deps: ['muted', 'text'], make: (c) => mix(c.muted, c.text, 0.56) },
  '--soft2': { deps: ['muted', 'text'], make: (c) => mix(c.muted, c.text, 0.45) },
  '--soft': { deps: ['muted', 'text'], make: (c) => mix(c.muted, c.text, 0.4) },
  '--soft3': { deps: ['muted', 'text'], make: (c) => mix(c.muted, c.text, 0.32) },
  '--icon': { deps: ['muted', 'base'], make: (c) => mix(c.muted, c.base, 0.06) },
  '--faint': { deps: ['muted', 'base'], make: (c) => mix(c.muted, c.base, 0.07) },
  '--faint2': { deps: ['muted', 'base'], make: (c) => mix(c.muted, c.base, 0.16) },
  '--dim': { deps: ['muted', 'base'], make: (c) => mix(c.muted, c.base, 0.31) },
  '--dim2': { deps: ['muted', 'base'], make: (c) => mix(c.muted, c.base, 0.34) },
  '--edge': { deps: ['muted', 'base'], make: (c) => mix(c.muted, c.base, 0.38) },
  '--accent-text': { deps: ['accent', 'ink'], make: (c) => mix(c.accent, c.ink, 0.69) },
  '--accent-hover': { deps: ['accent', 'ink'], make: (c) => mix(c.accent, c.ink, 0.3) },
  '--on-accent': { deps: ['accent'], make: (c) => onAccent(c.accent, 0.87) },
  '--on-accent2': { deps: ['accent'], make: (c) => onAccent(c.accent, 0.85) },
  '--accent-lo': { deps: ['accent', 'accent2'], make: (c) => mix(c.accent, c.accent2, 0.55) },
  '--accent2-text': { deps: ['accent2', 'ink'], make: (c) => mix(c.accent2, c.ink, 0.35) },
  '--bad-text': { deps: ['down', 'ink'], make: (c) => mix(c.down, c.ink, 0.4) },
  '--bad-text2': { deps: ['down', 'ink'], make: (c) => mix(c.down, c.ink, 0.5) },
  '--bad-text3': { deps: ['down', 'ink'], make: (c) => mix(c.down, c.ink, 0.2) },
  '--c-spy': { deps: ['muted', 'text'], make: (c) => mix(c.muted, c.text, 0.8) }
}

// The values the window was designed with (styles.css :root, report.html.j2 :root), kept while
// the dark Tearsheet look's colours they come from are unchanged.
export const EXACT: Record<string, string> = {
  '--shade': '0 0 0',
  '--shade-k': '1',
  '--scrim': '4 6 12',
  '--surface': '22 28 40',
  '--menu-bg': 'rgba(23, 28, 39, .97)',
  '--tip-bg': 'rgba(12, 16, 28, .94)',
  '--card-bg': 'rgba(18, 24, 36, .985)',
  '--option-bg': '#1C2230',
  '--kbd-bg': '#101520',
  '--veil': 'rgba(9, 13, 23, .55)',
  '--well-bg': 'rgba(14, 20, 32, .94)',
  '--well-bg2': 'rgba(16, 28, 40, .96)',
  '--readout': '#0E1422',
  '--hi': '#FFFFFF',
  '--text3': '#D5DEE7',
  '--text2': '#C3CDD8',
  '--soft2': '#BAC7D4',
  '--soft': '#B5C2CF',
  '--soft3': '#AEBBC8',
  '--icon': '#8C99A8',
  '--faint': '#8A97A6',
  '--faint2': '#7C8A9A',
  '--dim': '#67768A',
  '--dim2': '#637287',
  '--edge': '#5D6B7D',
  '--accent-text': '#D6F6FD',
  '--accent-hover': '#A6EDFA',
  '--on-accent': '#062029',
  '--on-accent2': '#05222B',
  '--accent-lo': '#4C8DFF',
  '--accent2-text': '#B9C4FF',
  '--bad-text': '#FFB3BA',
  '--bad-text2': '#FFC2C8',
  '--bad-text3': '#FF9AA3',
  '--c-spy': '#D8DCE6'
}

// The colours a person sets one by one, and the look colour each replaces.
const COLOUR_INPUT: Partial<Record<ColourKey, keyof Core>> = {
  background: 'base',
  sidebar: 'bg',
  text: 'text',
  'secondary-text': 'muted',
  accent: 'accent',
  'second-accent': 'accent2',
  'glow-1': 'g1',
  'glow-2': 'g2',
  'glow-3': 'g3'
}

export interface Resolved {
  shade: Shade
  colours: Inputs
  chart: { company: string; peers: string; spy: string }
  // The CSS names to set on <html>, with their values.
  tokens: Record<string, string>
  zoom: number
  // The window's own colour, shown before the page draws and while it resizes.
  background: string
}

// Every name the window's look can set, so a name left over from an earlier look is taken off.
export const TOKEN_NAMES = [
  '--bg', '--base', '--ink', '--text', '--muted', '--accent', '--accent2', '--up', '--hold', '--down', '--g1', '--g2', '--g3',
  '--base-rgb', '--text-rgb', '--accent-rgb', '--accent2-rgb', '--up-rgb', '--hold-rgb', '--down-rgb',
  ...Object.keys(RULES),
  '--glow', '--wt', '--round', '--frost', '--panel-a', '--line-a', '--panel', '--ui', '--c-co', '--c-peer'
]

const PANEL_A = { clear: '.02', frosted: '.045', solid: '.045' }
const LINE_A = { soft: '.055', standard: '.085', strong: '.2' }

// A number as the CSS writes it: ".4", "1", "1.5714".
export function num(n: number): string {
  const s = String(Math.round(n * 10000) / 10000)
  return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? `-${s.slice(2)}` : s
}

export function shadeOf(look: Appearance, systemDark: boolean): Shade {
  return look.mode === 'auto' ? (systemDark ? 'dark' : 'light') : look.mode
}

export function resolve(look: Appearance, systemDark = true): Resolved {
  const shade = shadeOf(look, systemDark)
  const base = lookById(look.basedOn) ?? LOOKS[0]
  const own: Inputs = { ...base[shade], ...RATINGS[0][shade] }
  const c: Inputs = { ...own, ...(RATINGS.find((r) => r.id === look.ratings) ?? RATINGS[0])[shade] }
  const swatch = ACCENTS.find((a) => a.id === look.accent)
  if (swatch && swatch.id !== 'look') c.accent = (shade === 'dark' ? swatch.dark : swatch.light) ?? c.accent
  for (const [key, into] of Object.entries(COLOUR_INPUT) as [ColourKey, keyof Core][]) {
    const hex = look.colours[key]
    if (hex) c[into] = hex.toUpperCase()
  }

  const exact = base.id === 'tearsheet' && shade === 'dark'
  const tokens: Record<string, string> = {
    '--bg': c.bg,
    '--base': c.base,
    '--ink': triple(c.ink),
    '--text': c.text,
    '--muted': c.muted,
    '--accent': c.accent,
    '--accent2': c.accent2,
    '--up': c.up,
    '--hold': c.hold,
    '--down': c.down,
    '--g1': triple(c.g1),
    '--g2': triple(c.g2),
    '--g3': triple(c.g3),
    // The r g b twins of the colours used see-through (styles.css says why).
    '--base-rgb': triple(c.base),
    '--text-rgb': triple(c.text),
    '--accent-rgb': triple(c.accent),
    '--accent2-rgb': triple(c.accent2),
    '--up-rgb': triple(c.up),
    '--hold-rgb': triple(c.hold),
    '--down-rgb': triple(c.down)
  }
  for (const [name, rule] of Object.entries(RULES)) {
    const same = rule.deps.every((d) => c[d].toUpperCase() === own[d].toUpperCase())
    tokens[name] = exact && same && EXACT[name] ? EXACT[name] : rule.make(c, shade)
  }
  const spy = look.colours['chart-sp500']
  if (spy) tokens['--c-spy'] = spy
  const company = look.colours['chart-company']
  const peers = look.colours['chart-peers']
  if (company) tokens['--c-co'] = company
  if (peers) tokens['--c-peer'] = peers

  tokens['--glow'] = num(look.glow / 100)
  tokens['--wt'] = String(look.boldness)
  tokens['--round'] = num(look.corners / 14)
  tokens['--frost'] = look.glass === 'frosted' ? '1' : '0'
  tokens['--panel-a'] = PANEL_A[look.glass]
  if (look.glass === 'solid') tokens['--panel'] = shade === 'dark' ? mix(c.base, c.ink, 0.07) : mix(c.base, '#FFFFFF', 0.85)
  tokens['--line-a'] = LINE_A[look.lines]
  tokens['--ui'] = fontStack(look.font)

  return {
    shade,
    colours: c,
    chart: { company: company ?? c.accent, peers: peers ?? c.accent2, spy: tokens['--c-spy'] },
    tokens,
    zoom: look.size / 100,
    background: c.bg
  }
}

// ---------- reading ----------

export interface Readability {
  what: string
  ratio: number
  need: number
  ok: boolean
}

// What a person reads, against what it sits on: body text and secondary text need 4.5:1 (WCAG
// AA for small text), the accent 3:1 (it marks links and buttons, and is never the only cue).
export function readability(r: Resolved): Readability[] {
  const c = r.colours
  const one = (what: string, fg: string, bg: string, need: number): Readability => {
    const ratio = contrast(fg, bg)
    return { what, ratio, need, ok: ratio >= need }
  }
  return [
    one('Text', c.text, c.base, 4.5),
    one('Text in the sidebar', c.text, c.bg, 4.5),
    one('Secondary text', c.muted, c.base, 4.5),
    one('The accent', c.accent, c.base, 3)
  ]
}

// The look's colours as the colour pickers show them (a picker can't take "255 255 255").
export function pickerValue(r: Resolved, key: ColourKey): string {
  const c = r.colours
  const value: Record<ColourKey, string> = {
    background: c.base,
    sidebar: c.bg,
    text: c.text,
    'secondary-text': c.muted,
    accent: c.accent,
    'second-accent': c.accent2,
    'glow-1': c.g1,
    'glow-2': c.g2,
    'glow-3': c.g3,
    'chart-company': r.chart.company,
    'chart-peers': r.chart.peers,
    'chart-sp500': r.chart.spy
  }
  return value[key].toUpperCase()
}

