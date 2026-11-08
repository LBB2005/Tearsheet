// The look in use, the looks people saved or imported, and which one is picked. Kept in the
// window's own storage, as the Animations level is (motion.ts), and applied to <html> at start-up
// (main.tsx) before anything draws. A change applies at once everywhere: the window (styles.css
// names), the report's frame (appearance/report.ts), and the window's own colour and zoom, which
// the main process keeps (main/look.ts).
//
// Kept in localStorage, each read back through the theme-file reader (themeFile.ts), so a stored
// value can never hold more than a theme file could:
//   appearance.look    the look in use, as a theme file's data
//   appearance.picked  the card picked: a look's id, or "saved:<id>"
//   appearance.saved   the saved and imported looks: [{ id, name, theme }], at most 24

import { useSyncExternalStore } from 'react'

import { LOOKS, lookById, type LookId } from './looks'
import { cleanName, DEFAULT_APPEARANCE, parseTheme, readTheme, sameLook, themeData, THEME_MARK, type Appearance } from './themeFile'
import { resolve, TOKEN_NAMES, type Resolved } from './tokens'

export interface SavedLook {
  id: string
  name: string
  look: Appearance
}

export interface AppearanceNow {
  look: Appearance
  picked: string
  saved: SavedLook[]
  resolved: Resolved
}

const LOOK_KEY = 'appearance.look'
const PICKED_KEY = 'appearance.picked'
const SAVED_KEY = 'appearance.saved'
export const SAVED_MAX = 24
const ID = /^[a-z0-9]{1,16}$/

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const read = (key: string): string | null => {
  try {
    return local()?.getItem(key) ?? null
  } catch {
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    local()?.setItem(key, value)
  } catch {
    // Not kept; it still applies until the window reloads.
  }
}

const systemDark = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : true)

function loadLook(): Appearance {
  const text = read(LOOK_KEY)
  if (!text) return DEFAULT_APPEARANCE
  const parsed = parseTheme(text)
  return parsed.ok ? parsed.look : DEFAULT_APPEARANCE
}

function loadSaved(): SavedLook[] {
  let list: unknown
  try {
    list = JSON.parse(read(SAVED_KEY) ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  const out: SavedLook[] = []
  for (const item of list.slice(0, SAVED_MAX)) {
    if (typeof item !== 'object' || item === null) continue
    const { id, name, theme } = item as Record<string, unknown>
    if (typeof id !== 'string' || !ID.test(id) || out.some((s) => s.id === id)) continue
    if (typeof theme !== 'object' || theme === null || Array.isArray(theme) || (theme as Record<string, unknown>)[THEME_MARK] !== 1) continue
    out.push({ id, name: cleanName(name) || 'My look', look: readTheme(theme as Record<string, unknown>).look })
  }
  return out
}

function loadPicked(saved: SavedLook[]): string {
  const picked = read(PICKED_KEY) ?? 'tearsheet'
  if (lookById(picked)) return picked
  if (picked.startsWith('saved:') && saved.some((s) => `saved:${s.id}` === picked)) return picked
  return 'tearsheet'
}

let now: AppearanceNow = load()
const listeners = new Set<() => void>()

function load(): AppearanceNow {
  const look = loadLook()
  const saved = loadSaved()
  return { look, picked: loadPicked(saved), saved, resolved: resolve(look, systemDark()) }
}

// ---------- applying ----------

let lastWindow = ''

// The look's names on <html>, and the window's colour and zoom in the main process.
export function applyTo(resolved: Resolved, root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement): void {
  if (root) {
    for (const name of TOKEN_NAMES) if (!(name in resolved.tokens)) root.style.removeProperty(name)
    for (const [name, value] of Object.entries(resolved.tokens)) root.style.setProperty(name, value)
    root.style.setProperty('color-scheme', resolved.shade)
    root.dataset.shade = resolved.shade
  }
  const bridge = typeof window === 'undefined' ? undefined : window.tearsheet
  const key = `${resolved.zoom}|${resolved.background}`
  if (bridge?.setLook && key !== lastWindow) {
    lastWindow = key
    void bridge.setLook({ zoom: resolved.zoom, background: resolved.background }).catch(() => undefined)
  }
}

function commit(next: Omit<AppearanceNow, 'resolved'>): void {
  now = { ...next, resolved: resolve(next.look, systemDark()) }
  write(LOOK_KEY, JSON.stringify(themeData(now.look, '')))
  write(PICKED_KEY, now.picked)
  write(SAVED_KEY, JSON.stringify(now.saved.map((s) => ({ id: s.id, name: s.name, theme: themeData(s.look, s.name) }))))
  applyTo(now.resolved)
  for (const fn of listeners) fn()
}

// At start-up (main.tsx): the stored look on the page before it draws, and the page follows the
// Mac's light or dark setting while the look says Match the Mac.
let watching = false
export function startAppearance(): void {
  applyTo(now.resolved)
  if (watching || typeof matchMedia !== 'function') return
  watching = true
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (now.look.mode !== 'auto') return
    now = { ...now, resolved: resolve(now.look, systemDark()) }
    applyTo(now.resolved)
    for (const fn of listeners) fn()
  })
}

// Reads the stored looks again (and forgets the last window colour sent), as at start-up.
export function reloadAppearance(): void {
  now = load()
  lastWindow = ''
}

export function appearanceNow(): AppearanceNow {
  return now
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useAppearance(): AppearanceNow {
  return useSyncExternalStore(subscribe, appearanceNow)
}

// ---------- changes ----------

// One setting changed. The picked card stays; the name then says "Custom, based on …".
export function setLook(look: Appearance): void {
  commit({ ...now, look })
}

// A card: a ready-made look keeps the person's text size, glow, glass, corners, ratings and mode,
// and drops colours set by hand; a saved look comes back exactly as it was saved.
export function pickLook(id: string): void {
  const saved = now.saved.find((s) => `saved:${s.id}` === id)
  if (saved) return commit({ ...now, look: saved.look, picked: id })
  const look = lookById(id)
  if (!look) return
  const was = lookById(now.look.basedOn)
  const lines = look.contrast ? 'strong' : was?.contrast && now.look.lines === 'strong' ? 'standard' : now.look.lines
  commit({ ...now, look: { ...now.look, basedOn: look.id, accent: 'look', colours: {}, lines }, picked: look.id })
}

// What the picked card is called now.
export function lookName(n: AppearanceNow = now): string {
  const saved = n.saved.find((s) => `saved:${s.id}` === n.picked)
  if (saved) return sameLook(saved.look, n.look) ? saved.name : `Custom, based on ${saved.name}`
  const base = lookById(n.look.basedOn) ?? LOOKS[0]
  const plain = Object.keys(n.look.colours).length === 0 && n.look.accent === 'look' && n.picked === base.id
  return plain ? base.name : `Custom, based on ${base.name}`
}

// Whether the look has changes that "Save as a look…" would keep.
export function canSave(n: AppearanceNow = now): boolean {
  const saved = n.saved.find((s) => `saved:${s.id}` === n.picked)
  if (saved) return !sameLook(saved.look, n.look)
  return lookName(n) !== (lookById(n.look.basedOn) ?? LOOKS[0]).name
}

let counter = 0
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`.slice(-16)

// A name not already in the list: "My look", "My look 2", …
function freeName(want: string, saved: SavedLook[]): string {
  const base = cleanName(want) || 'My look'
  const taken = new Set(saved.map((s) => s.name))
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    const name = `${base.slice(0, 36)} ${i}`
    if (!taken.has(name)) return name
  }
}

export type SaveResult = { ok: true; look: SavedLook } | { ok: false; message: string }

export function saveCurrent(name = 'My look'): SaveResult {
  if (now.saved.length >= SAVED_MAX) return { ok: false, message: `You have ${SAVED_MAX} saved looks, the most Tearsheet keeps. Remove one first.` }
  const look: SavedLook = { id: newId(), name: freeName(name, now.saved), look: now.look }
  commit({ ...now, saved: [...now.saved, look], picked: `saved:${look.id}` })
  return { ok: true, look }
}

export function removeSaved(id: string): void {
  const picked = now.picked === `saved:${id}` ? now.look.basedOn : now.picked
  commit({ ...now, saved: now.saved.filter((s) => s.id !== id), picked })
}

// Puts everything back as it was before a change (the notices' Undo).
export function restore(before: AppearanceNow): void {
  commit({ look: before.look, picked: before.picked, saved: before.saved })
}

export type ImportResult = { ok: true; name: string; skipped: number; before: AppearanceNow } | { ok: false; message: string }

// A theme file's text from Import…: read as untrusted (themeFile.ts), added to the saved looks,
// and put on at once. `before` is what Undo puts back.
export function importTheme(text: string): ImportResult {
  const parsed = parseTheme(text)
  if (!parsed.ok) return parsed
  if (now.saved.length >= SAVED_MAX) return { ok: false, message: `You have ${SAVED_MAX} saved looks, the most Tearsheet keeps. Remove one, then import again.` }
  const before = now
  const look: SavedLook = { id: newId(), name: freeName(parsed.name || 'Imported look', now.saved), look: parsed.look }
  commit({ look: parsed.look, picked: `saved:${look.id}`, saved: [...now.saved, look] })
  return { ok: true, name: look.name, skipped: parsed.skipped, before }
}

// Back to Tearsheet's own look. Saved looks stay. `before` is what Undo puts back.
export function resetLook(): AppearanceNow {
  const before = now
  commit({ ...now, look: DEFAULT_APPEARANCE, picked: 'tearsheet' satisfies LookId })
  return before
}
