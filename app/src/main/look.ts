// The look picked on Settings → Appearance, as far as the main process sees it: the window's zoom
// (text size) and its own colour, kept in <userData>/window-look.json so the next launch opens
// with them before the page draws, and theme files through the Mac's open and save panels.
// Everything that comes from the page is checked here again: a zoom in range, a #RRGGBB colour,
// and a theme file's text that is small and is a theme. The page reads an opened file as
// untrusted itself (renderer/appearance/themeFile.ts).

import { readFileSync, writeFileSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'

import { dialog, ipcMain, nativeTheme, type BrowserWindow, type Dialog } from 'electron'

export interface WindowLook {
  zoom: number
  background: string
}

// Before the page has sent its look (the first launch, or a missing file), the window follows the
// Mac's light or dark setting, as a new user's look does (Match the Mac). The colours are the
// default look's main area at its edges (renderer/appearance/tokens.ts windowColour), so the strip
// macOS fills while the window grows is the page's colour.
export const DEFAULT_WINDOW_LOOK: WindowLook = { zoom: 1, background: '#080D19' }
export const DEFAULT_WINDOW_LOOK_LIGHT: WindowLook = { zoom: 1, background: '#F0F3F9' }

export function defaultWindowLook(dark: boolean = nativeTheme?.shouldUseDarkColors ?? true): WindowLook {
  return dark ? DEFAULT_WINDOW_LOOK : DEFAULT_WINDOW_LOOK_LIGHT
}
export const ZOOM = { min: 0.85, max: 1.3 }
export const THEME_MAX_BYTES = 64 * 1024
export const THEME_EXTENSION = 'tearsheet-theme'

export function parseWindowLook(value: unknown): WindowLook | null {
  if (typeof value !== 'object' || value === null) return null
  const { zoom, background } = value as Record<string, unknown>
  if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < ZOOM.min || zoom > ZOOM.max) return null
  if (typeof background !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(background)) return null
  return { zoom, background: background.toUpperCase() }
}

export function readWindowLook(file: string, dark?: boolean): WindowLook {
  try {
    return parseWindowLook(JSON.parse(readFileSync(file, 'utf8'))) ?? defaultWindowLook(dark)
  } catch {
    return defaultWindowLook(dark)
  }
}

export function writeWindowLook(file: string, look: WindowLook): void {
  try {
    writeFileSync(file, JSON.stringify(look))
  } catch {
    // Not kept; the page sends it again at the next launch.
  }
}

// A file name for a look's name: no slashes, colons or control characters, at most 60 characters.
export function themeFileName(name: unknown): string {
  const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '').replace(/^\.+/, '').trim().slice(0, 60).trim() : ''
  return `${clean || 'My look'}.${THEME_EXTENSION}`
}

// A theme file's text to save: small, and a theme (the marker and version 1), or nothing is written.
export function isThemeText(text: unknown): text is string {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > THEME_MAX_BYTES) return false
  try {
    const data: unknown = JSON.parse(text)
    return typeof data === 'object' && data !== null && !Array.isArray(data) && (data as Record<string, unknown>)['tearsheet-theme'] === 1
  } catch {
    return false
  }
}

export type OpenedTheme = { ok: true; text: string } | { ok: false; cancelled: true } | { ok: false; cancelled?: false; message: string }
export type SavedTheme = { ok: true; file: string } | { ok: false; cancelled: true } | { ok: false; cancelled?: false; message: string }

const FILTERS = [{ name: 'Tearsheet theme', extensions: [THEME_EXTENSION, 'json'] }]

export async function openTheme(window: BrowserWindow, dialog: Pick<Dialog, 'showOpenDialog'>): Promise<OpenedTheme> {
  const picked = await dialog.showOpenDialog(window, { title: 'Import a theme', buttonLabel: 'Import', properties: ['openFile'], filters: FILTERS })
  const file = picked.filePaths[0]
  if (picked.canceled || !file) return { ok: false, cancelled: true }
  try {
    if ((await stat(file)).size > THEME_MAX_BYTES) return { ok: false, message: 'That file is too big to be a Tearsheet theme. Nothing changed.' }
    return { ok: true, text: await readFile(file, 'utf8') }
  } catch {
    return { ok: false, message: 'That file couldn’t be opened. Nothing changed.' }
  }
}

export async function saveTheme(window: BrowserWindow, dialog: Pick<Dialog, 'showSaveDialog'>, name: unknown, text: unknown): Promise<SavedTheme> {
  if (!isThemeText(text)) return { ok: false, message: 'Tearsheet couldn’t write that theme.' }
  const picked = await dialog.showSaveDialog(window, { title: 'Export this look', buttonLabel: 'Export', defaultPath: themeFileName(name), filters: FILTERS })
  if (picked.canceled || !picked.filePath) return { ok: false, cancelled: true }
  try {
    await writeFile(picked.filePath, text, 'utf8')
    return { ok: true, file: picked.filePath }
  } catch {
    return { ok: false, message: 'Tearsheet couldn’t save the file there. Try another folder.' }
  }
}

// The window takes a look the page sends at once, and keeps it for the next launch.
export function applyWindowLook(window: BrowserWindow, file: string, value: unknown): boolean {
  const look = parseWindowLook(value)
  if (!look || window.isDestroyed()) return false
  window.setBackgroundColor(look.background)
  window.webContents.setZoomFactor(look.zoom)
  writeWindowLook(file, look)
  return true
}

// The page's three calls for its look (preload: setLook, openTheme, saveTheme).
export function registerLookIpc(window: BrowserWindow, file: string): void {
  ipcMain.handle('tearsheet:setLook', (_event, look: unknown) => applyWindowLook(window, file, look))
  ipcMain.handle('tearsheet:openTheme', () => openTheme(window, dialog))
  ipcMain.handle('tearsheet:saveTheme', (_event, name: unknown, text: unknown) => saveTheme(window, dialog, name, text))
}
