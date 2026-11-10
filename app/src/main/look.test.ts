// The main process's side of the look: the window's zoom and colour (checked, applied, kept for
// the next launch) and theme files through the Mac's open and save panels (small, and a theme).

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  nativeTheme: { shouldUseDarkColors: true },
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) }
}))

import type { BrowserWindow } from 'electron'

import { applyWindowLook, DEFAULT_WINDOW_LOOK, DEFAULT_WINDOW_LOOK_LIGHT, isThemeText, openTheme, parseWindowLook, readWindowLook, registerLookIpc, saveTheme, themeFileName, THEME_MAX_BYTES, writeWindowLook } from './look'

// Every folder a test makes is removed after it.
const made: string[] = []
const dir = () => {
  const folder = mkdtempSync(join(tmpdir(), 'tearsheet-look-'))
  made.push(folder)
  return folder
}
afterEach(() => {
  for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true })
})
const THEME = JSON.stringify({ 'tearsheet-theme': 1, name: 'Night shift', glow: 30 })

function fakeWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    setBackgroundColor: vi.fn(),
    webContents: { setZoomFactor: vi.fn() }
  }
}

describe('the window’s look', () => {
  test('takes only a zoom in range and a #RRGGBB colour', () => {
    expect(parseWindowLook({ zoom: 1.1, background: '#e8edf2' })).toEqual({ zoom: 1.1, background: '#E8EDF2' })
    for (const bad of [null, 'x', { zoom: 2, background: '#000000' }, { zoom: 0.5, background: '#000000' }, { zoom: Number.NaN, background: '#000000' }, { zoom: '1', background: '#000000' }, { zoom: 1, background: 'red' }, { zoom: 1, background: '#000' }, { zoom: 1, background: '#000000; x' }]) {
      expect(parseWindowLook(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  test('is kept for the next launch, and a missing or broken file gives today’s', () => {
    const file = join(dir(), 'window-look.json')
    expect(readWindowLook(file)).toEqual(DEFAULT_WINDOW_LOOK)
    writeWindowLook(file, { zoom: 1.2, background: '#F5F7FA' })
    expect(readWindowLook(file)).toEqual({ zoom: 1.2, background: '#F5F7FA' })
    writeFileSync(file, '{"zoom": 9, "background": "#FFFFFF"}')
    expect(readWindowLook(file)).toEqual(DEFAULT_WINDOW_LOOK)
    writeFileSync(file, 'not json')
    expect(readWindowLook(file)).toEqual(DEFAULT_WINDOW_LOOK)
    // A folder that can't be written to is no error.
    expect(() => writeWindowLook(join(dir(), 'missing', 'x.json'), DEFAULT_WINDOW_LOOK)).not.toThrow()
  })

  test('with nothing kept yet, follows the Mac’s light or dark setting', () => {
    const file = join(dir(), 'window-look.json')
    expect(readWindowLook(file, false)).toEqual(DEFAULT_WINDOW_LOOK_LIGHT)
    expect(readWindowLook(file, true)).toEqual(DEFAULT_WINDOW_LOOK)
    // Without a word, the Mac's own setting (dark in this test).
    expect(readWindowLook(file)).toEqual(DEFAULT_WINDOW_LOOK)
  })

  test('applies to the window at once', () => {
    const file = join(dir(), 'window-look.json')
    const window = fakeWindow()
    expect(applyWindowLook(window as unknown as BrowserWindow, file, { zoom: 0.9, background: '#101010' })).toBe(true)
    expect(window.setBackgroundColor).toHaveBeenCalledWith('#101010')
    expect(window.webContents.setZoomFactor).toHaveBeenCalledWith(0.9)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ zoom: 0.9, background: '#101010' })
  })

  test('a bad look, or a closed window, changes nothing', () => {
    const window = fakeWindow()
    expect(applyWindowLook(window as unknown as BrowserWindow, join(dir(), 'a.json'), { zoom: 5, background: '#101010' })).toBe(false)
    expect(applyWindowLook(fakeWindow(true) as unknown as BrowserWindow, join(dir(), 'a.json'), { zoom: 1, background: '#101010' })).toBe(false)
    expect(window.setBackgroundColor).not.toHaveBeenCalled()
  })
})

describe('theme files', () => {
  test('a file name comes from the look’s name, with nothing that could leave the folder', () => {
    expect(themeFileName('Night shift')).toBe('Night shift.tearsheet-theme')
    expect(themeFileName('../../etc/passwd')).toBe('etcpasswd.tearsheet-theme')
    expect(themeFileName('a:b*c?"d"<e>|f\\g\u0000')).toBe('abcdefg.tearsheet-theme')
    expect(themeFileName('   ')).toBe('My look.tearsheet-theme')
    expect(themeFileName(42)).toBe('My look.tearsheet-theme')
    expect(themeFileName('x'.repeat(200))).toBe(`${'x'.repeat(60)}.tearsheet-theme`)
  })

  test('only a small theme is written', () => {
    expect(isThemeText(THEME)).toBe(true)
    expect(isThemeText('{"glow": 30}')).toBe(false)
    expect(isThemeText('[1]')).toBe(false)
    expect(isThemeText('not json')).toBe(false)
    expect(isThemeText(42)).toBe(false)
    expect(isThemeText(JSON.stringify({ 'tearsheet-theme': 1, pad: 'x'.repeat(THEME_MAX_BYTES) }))).toBe(false)
  })

  test('opening: the chosen file’s text, or why not', async () => {
    const folder = dir()
    const good = join(folder, 'good.tearsheet-theme')
    writeFileSync(good, THEME)
    const big = join(folder, 'big.json')
    writeFileSync(big, 'x'.repeat(THEME_MAX_BYTES + 1))
    const window = {} as BrowserWindow
    const dialog = { showOpenDialog: vi.fn() }

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [good] })
    expect(await openTheme(window, dialog)).toEqual({ ok: true, text: THEME })
    expect(dialog.showOpenDialog.mock.calls[0][1]).toMatchObject({ properties: ['openFile'], filters: [{ extensions: ['tearsheet-theme', 'json'] }] })

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await openTheme(window, dialog)).toEqual({ ok: false, cancelled: true })

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [big] })
    expect(await openTheme(window, dialog)).toEqual({ ok: false, message: 'That file is too big to be a Tearsheet theme. Nothing changed.' })

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [join(folder, 'gone.json')] })
    expect(await openTheme(window, dialog)).toEqual({ ok: false, message: 'That file couldn’t be opened. Nothing changed.' })
  })

  test('saving: a theme, where the person chose, under a clean name', async () => {
    const folder = dir()
    const window = {} as BrowserWindow
    const dialog = { showSaveDialog: vi.fn() }
    const file = join(folder, 'Night shift.tearsheet-theme')

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: file })
    expect(await saveTheme(window, dialog, 'Night/shift', THEME)).toEqual({ ok: true, file })
    expect(dialog.showSaveDialog.mock.calls[0][1]).toMatchObject({ defaultPath: 'Nightshift.tearsheet-theme' })
    expect(readFileSync(file, 'utf8')).toBe(THEME)

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' })
    expect(await saveTheme(window, dialog, 'x', THEME)).toEqual({ ok: false, cancelled: true })

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(folder, 'missing', 'x.tearsheet-theme') })
    expect(await saveTheme(window, dialog, 'x', THEME)).toEqual({ ok: false, message: 'Tearsheet couldn’t save the file there. Try another folder.' })

    // Something that isn't a theme is refused before any panel opens.
    dialog.showSaveDialog.mockClear()
    expect(await saveTheme(window, dialog, 'x', '#!/bin/sh\nrm -rf ~')).toEqual({ ok: false, message: 'Tearsheet couldn’t write that theme.' })
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })

  test('the three calls are registered for the page', async () => {
    const window = fakeWindow()
    registerLookIpc(window as unknown as BrowserWindow, join(dir(), 'w.json'))
    expect([...handlers.keys()].sort()).toEqual(['tearsheet:openTheme', 'tearsheet:saveTheme', 'tearsheet:setLook'])
    expect(handlers.get('tearsheet:setLook')!({}, { zoom: 1, background: '#0A0D14' })).toBe(true)
    const { dialog } = await import('electron')
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await handlers.get('tearsheet:openTheme')!({})).toEqual({ ok: false, cancelled: true })
    expect(await handlers.get('tearsheet:saveTheme')!({}, 'x', 'nope')).toEqual({ ok: false, message: 'Tearsheet couldn’t write that theme.' })
  })
})
