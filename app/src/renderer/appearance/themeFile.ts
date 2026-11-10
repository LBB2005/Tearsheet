// What a look is (Appearance), and the theme file that carries one from Mac to Mac. A theme file
// is someone else's file, so it is read as untrusted (Liam's answer 3A): only the settings named
// here, each with a safe value (a #RRGGBB colour, a number in its range, one of a fixed list of
// choices), are taken. Anything else, CSS and code included, is skipped and counted, and a file
// that isn't a theme changes nothing. The window's own stored look goes through the same reader.
//
// The file, a small JSON text named "<name>.tearsheet-theme":
//   { "tearsheet-theme": 1, "name": "Night shift", "based-on": "dusk", "mode": "dark",
//     "accent": "pink", "colours": { "text": "#EFE9F7" },
//     "text": { "font": "sf", "size": 100, "boldness": 0 },
//     "glow": 40, "sidebar-contrast": 50, "corners": 14, "glass": "frosted", "lines": "standard",
//     "ratings": "standard" }
// Animations are not in it: how much moves is a person's own need, not part of a look.

import { isHex } from './colour'
import { ACCENTS, FONTS, LOOKS, RATINGS, type AccentId, type FontId, type LookId, type RatingSet } from './looks'

export type Mode = 'dark' | 'light' | 'auto'
export type Glass = 'clear' | 'frosted' | 'solid'
export type Lines = 'soft' | 'standard' | 'strong'
export type Boldness = -100 | 0 | 100 | 200

// The colours a person can set one by one, by their names in the file.
export const COLOUR_KEYS = ['background', 'sidebar', 'text', 'secondary-text', 'accent', 'second-accent', 'glow-1', 'glow-2', 'glow-3', 'chart-company', 'chart-peers', 'chart-sp500'] as const
export type ColourKey = (typeof COLOUR_KEYS)[number]

export interface Appearance {
  basedOn: LookId
  mode: Mode
  accent: AccentId
  colours: Partial<Record<ColourKey, string>>
  font: FontId
  size: number // percent: 85 to 130, in steps of 5
  boldness: Boldness
  glow: number // percent of the glows' first strength: 0 to 100, in steps of 5
  // How far the sidebar is lifted toward the text colour in dark mode, in percent: 0 to 100, in
  // steps of 5. 50 is Liam's pick, "Raised" (8 Nov 2026); 0 is the flat sidebar from before.
  sidebarContrast: number
  corners: number // the panels' corner in px: 0 to 22
  glass: Glass
  lines: Lines
  ratings: RatingSet
}

// Today's look, with Liam's 40% glow (7 Nov 2026) and Raised sidebar (8 Nov 2026).
export const DEFAULT_APPEARANCE: Appearance = {
  basedOn: 'tearsheet',
  mode: 'auto',
  accent: 'look',
  colours: {},
  font: 'avenir',
  size: 100,
  boldness: 0,
  glow: 40,
  sidebarContrast: 50,
  corners: 14,
  glass: 'frosted',
  lines: 'standard',
  ratings: 'standard'
}

export const MODES: Mode[] = ['dark', 'light', 'auto']
export const GLASSES: Glass[] = ['clear', 'frosted', 'solid']
export const LINES: Lines[] = ['soft', 'standard', 'strong']
export const BOLDNESS: Boldness[] = [-100, 0, 100, 200]
export const SIZE = { min: 85, max: 130, step: 5 }
export const GLOW = { min: 0, max: 100, step: 5 }
export const SIDEBAR_CONTRAST = { min: 0, max: 100, step: 5 }
export const CORNERS = { min: 0, max: 22, step: 1 }

export const THEME_MARK = 'tearsheet-theme'
export const THEME_VERSION = 1
// A theme is a few hundred bytes; anything this big is not one.
export const THEME_MAX_BYTES = 64 * 1024
export const NAME_MAX = 40

const pick = <T extends string>(value: unknown, list: readonly T[]): T | null => (typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null)

const inRange = (value: unknown, r: { min: number; max: number; step: number }): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < r.min || value > r.max) return null
  return Math.min(r.max, Math.max(r.min, Math.round(value / r.step) * r.step))
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// A name to show: no control or direction-changing characters, trimmed, at most 40 characters.
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim()
}

export interface ReadTheme {
  look: Appearance
  name: string
  // Parts that were left out: unknown settings, and known ones with a value that can't be used.
  skipped: number
}

// Reads a parsed theme. Missing settings take today's defaults; nothing outside the list is kept.
export function readTheme(data: Record<string, unknown>): ReadTheme {
  const look: Appearance = { ...DEFAULT_APPEARANCE, colours: {} }
  let skipped = 0
  const take = <T>(value: T | null, set: (v: T) => void) => {
    if (value === null) skipped++
    else set(value)
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === THEME_MARK || key === 'name') continue
    if (key === 'based-on') take(pick(value, LOOKS.map((l) => l.id)), (v) => (look.basedOn = v))
    else if (key === 'mode') take(pick(value, MODES), (v) => (look.mode = v))
    else if (key === 'accent') take(pick(value, ACCENTS.map((a) => a.id)), (v) => (look.accent = v))
    else if (key === 'glow') take(inRange(value, GLOW), (v) => (look.glow = v))
    else if (key === 'sidebar-contrast') take(inRange(value, SIDEBAR_CONTRAST), (v) => (look.sidebarContrast = v))
    else if (key === 'corners') take(inRange(value, CORNERS), (v) => (look.corners = v))
    else if (key === 'glass') take(pick(value, GLASSES), (v) => (look.glass = v))
    else if (key === 'lines') take(pick(value, LINES), (v) => (look.lines = v))
    else if (key === 'ratings') take(pick(value, RATINGS.map((r) => r.id)), (v) => (look.ratings = v))
    else if (key === 'text' && isObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'font') take(pick(v, FONTS.map((f) => f.id)), (x) => (look.font = x))
        else if (k === 'size') take(inRange(v, SIZE), (x) => (look.size = x))
        else if (k === 'boldness') take(BOLDNESS.includes(v as Boldness) ? (v as Boldness) : null, (x) => (look.boldness = x))
        else skipped++
      }
    } else if (key === 'colours' && isObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        const colour = pick(k, COLOUR_KEYS)
        if (colour && isHex(v)) look.colours[colour] = v.toUpperCase()
        else skipped++
      }
    } else skipped++
  }
  return { look, name: cleanName(data.name), skipped }
}

export type ParsedTheme = ({ ok: true } & ReadTheme) | { ok: false; message: string }

// A theme file's text, as the Import button gets it. The message says why nothing changed.
export function parseTheme(text: string): ParsedTheme {
  if (typeof text !== 'string') return { ok: false, message: 'That file couldn’t be read as a Tearsheet theme. Nothing changed.' }
  if (text.length > THEME_MAX_BYTES) return { ok: false, message: 'That file is too big to be a Tearsheet theme. Nothing changed.' }
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { ok: false, message: 'That file couldn’t be read as a Tearsheet theme. Nothing changed.' }
  }
  if (!isObject(data) || !(THEME_MARK in data)) return { ok: false, message: 'That file isn’t a Tearsheet theme. Nothing changed.' }
  const version = data[THEME_MARK]
  if (typeof version === 'number' && version > THEME_VERSION) return { ok: false, message: 'That theme was made by a newer Tearsheet. Nothing changed.' }
  if (version !== THEME_VERSION) return { ok: false, message: 'That file isn’t a Tearsheet theme. Nothing changed.' }
  return { ok: true, ...readTheme(data) }
}

// A look as a theme file's data. Every setting is written, so the file means the same on any
// Tearsheet, whatever its defaults are by then.
export function themeData(look: Appearance, name: string): Record<string, unknown> {
  const data: Record<string, unknown> = { [THEME_MARK]: THEME_VERSION, name: cleanName(name) || 'My look', 'based-on': look.basedOn, mode: look.mode, accent: look.accent }
  const colours = Object.fromEntries(COLOUR_KEYS.filter((k) => look.colours[k]).map((k) => [k, look.colours[k]]))
  if (Object.keys(colours).length) data.colours = colours
  Object.assign(data, { text: { font: look.font, size: look.size, boldness: look.boldness }, glow: look.glow, 'sidebar-contrast': look.sidebarContrast, corners: look.corners, glass: look.glass, lines: look.lines, ratings: look.ratings })
  return data
}

export function themeText(look: Appearance, name: string): string {
  return JSON.stringify(themeData(look, name), null, 2) + '\n'
}

// Whether two looks are the same in every setting.
export function sameLook(a: Appearance, b: Appearance): boolean {
  return JSON.stringify(themeData(a, '')) === JSON.stringify(themeData(b, ''))
}
