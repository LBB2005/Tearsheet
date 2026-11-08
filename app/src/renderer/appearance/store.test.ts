// @vitest-environment jsdom
// The look in use, saved looks and theme imports, as the window keeps them: in its own storage,
// read back through the theme-file reader, and applied to <html> and the window at once.

import { beforeEach, describe, expect, test, vi } from 'vitest'

import { bridge } from '../test/bridge'
import { setSystemDark } from '../test/screen'
import { DEFAULT_APPEARANCE, themeText } from './themeFile'

type StoreModule = typeof import('./store')

// A fresh store, as at start-up, reading whatever storage holds now.
async function fresh(): Promise<StoreModule> {
  vi.resetModules()
  const store = await import('./store')
  store.startAppearance()
  return store
}

const html = () => document.documentElement
const token = (name: string) => html().style.getPropertyValue(name)

beforeEach(() => {
  html().removeAttribute('style')
  html().removeAttribute('data-shade')
})

describe('at start-up', () => {
  test('with nothing stored, the default look goes on <html> and the window', async () => {
    const store = await fresh()
    expect(store.appearanceNow().look).toEqual(DEFAULT_APPEARANCE)
    expect(store.appearanceNow().picked).toBe('tearsheet')
    expect(token('--bg')).toBe('#0A0D14')
    expect(token('--glow')).toBe('.4')
    expect(html().style.getPropertyValue('color-scheme')).toBe('dark')
    expect(html().dataset.shade).toBe('dark')
    expect(bridge.setLook).toHaveBeenCalledWith({ zoom: 1, background: '#0A0D14' })
  })

  test('a stored look comes back', async () => {
    localStorage.setItem('appearance.look', themeText({ ...DEFAULT_APPEARANCE, basedOn: 'graphite', glow: 20 }, ''))
    localStorage.setItem('appearance.picked', 'graphite')
    const store = await fresh()
    expect(store.appearanceNow().look.basedOn).toBe('graphite')
    expect(store.appearanceNow().picked).toBe('graphite')
    expect(token('--glow')).toBe('.2')
  })

  test('broken or hostile storage falls back to the default, and keeps only what’s safe', async () => {
    localStorage.setItem('appearance.look', '{"tearsheet-theme":1,"colours":{"text":"red;}body{display:none"},"glow":20}')
    localStorage.setItem('appearance.picked', 'saved:nope')
    localStorage.setItem('appearance.saved', JSON.stringify([{ id: '../x', name: 'Bad id', theme: {} }, { id: 'ok1', name: 'Fine‮', theme: { 'tearsheet-theme': 1, glow: 10, css: 'x' } }, { id: 'ok1', name: 'Twice', theme: { 'tearsheet-theme': 1 } }, 'junk', null, { id: 'ok2', name: 'Not a theme', theme: { glow: 10 } }]))
    const store = await fresh()
    const now = store.appearanceNow()
    expect(now.look).toEqual({ ...DEFAULT_APPEARANCE, glow: 20 })
    expect(now.picked).toBe('tearsheet')
    expect(now.saved).toEqual([{ id: 'ok1', name: 'Fine', look: { ...DEFAULT_APPEARANCE, glow: 10 } }])

    localStorage.setItem('appearance.look', 'not json')
    localStorage.setItem('appearance.saved', '{"not":"a list"}')
    const again = await fresh()
    expect(again.appearanceNow().look).toEqual(DEFAULT_APPEARANCE)
    expect(again.appearanceNow().saved).toEqual([])
  })
})

describe('changes', () => {
  test('a setting applies at once, is kept, and the window hears of a new zoom or colour only', async () => {
    const store = await fresh()
    bridge.setLook.mockClear()
    store.setLook({ ...store.appearanceNow().look, glow: 70 })
    expect(token('--glow')).toBe('.7')
    expect(JSON.parse(localStorage.getItem('appearance.look')!).glow).toBe(70)
    expect(bridge.setLook).not.toHaveBeenCalled()
    store.setLook({ ...store.appearanceNow().look, size: 115, mode: 'light' })
    expect(bridge.setLook).toHaveBeenCalledWith({ zoom: 1.15, background: '#E8EDF2' })
    expect(html().dataset.shade).toBe('light')
  })

  test('a name set by an earlier look is taken off by the next', async () => {
    const store = await fresh()
    store.setLook({ ...store.appearanceNow().look, glass: 'solid', colours: { 'chart-company': '#FFFFFF' } })
    expect(token('--panel')).not.toBe('')
    expect(token('--c-co')).toBe('#FFFFFF')
    store.setLook({ ...store.appearanceNow().look, glass: 'frosted', colours: {} })
    expect(token('--panel')).toBe('')
    expect(token('--c-co')).toBe('')
  })

  test('Match the Mac follows the Mac as it changes', async () => {
    const store = await fresh()
    store.setLook({ ...store.appearanceNow().look, mode: 'auto' })
    expect(html().dataset.shade).toBe('dark')
    setSystemDark(false)
    expect(html().dataset.shade).toBe('light')
    expect(store.appearanceNow().resolved.shade).toBe('light')
    store.setLook({ ...store.appearanceNow().look, mode: 'dark' })
    setSystemDark(true)
    setSystemDark(false)
    expect(html().dataset.shade).toBe('dark')
  })

  test('subscribers hear every change, until they stop listening', async () => {
    const store = await fresh()
    const fn = vi.fn()
    const stop = store.subscribe(fn)
    store.setLook({ ...store.appearanceNow().look, glow: 10 })
    stop()
    store.setLook({ ...store.appearanceNow().look, glow: 20 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('storage that refuses writes still lets the look apply', async () => {
    const store = await fresh()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    store.setLook({ ...store.appearanceNow().look, glow: 15 })
    expect(token('--glow')).toBe('.15')
    setItem.mockRestore()
  })
})

describe('the looks', () => {
  test('a ready-made look keeps text size, glow and the rest, and drops colours set by hand', async () => {
    const store = await fresh()
    store.setLook({ ...store.appearanceNow().look, size: 110, glow: 25, colours: { text: '#FFFFFF' }, accent: 'pink' })
    expect(store.lookName()).toBe('Custom, based on Tearsheet')
    store.pickLook('graphite')
    const look = store.appearanceNow().look
    expect([look.basedOn, look.size, look.glow, look.accent, look.colours]).toEqual(['graphite', 110, 25, 'look', {}])
    expect(store.lookName()).toBe('Graphite')
    expect(store.canSave()).toBe(false)
    store.pickLook('no-such-look')
    expect(store.appearanceNow().look.basedOn).toBe('graphite')
  })

  test('a More look brings its own font, corners and glow, and the first six bring today’s back', async () => {
    const store = await fresh()
    store.pickLook('terminal')
    let look = store.appearanceNow().look
    expect([look.basedOn, look.font, look.corners, look.glow]).toEqual(['terminal', 'mono', 2, 15])
    expect(store.lookName()).toBe('Terminal')
    expect(store.canSave()).toBe(false)
    expect(token('--ui')).toContain('SF Mono')
    store.pickLook('aurora')
    look = store.appearanceNow().look
    expect([look.font, look.corners, look.glow]).toEqual(['avenir', 16, 85])
    store.pickLook('tearsheet')
    look = store.appearanceNow().look
    expect([look.font, look.corners, look.glow]).toEqual(['avenir', 14, 40])
    expect(store.appearanceNow().picked).toBe('tearsheet')
  })

  test('a font, corners or glow the person changed stays when they pick another look', async () => {
    const store = await fresh()
    store.setLook({ ...store.appearanceNow().look, font: 'ny', glow: 70 })
    store.pickLook('signal')
    const look = store.appearanceNow().look
    // Signal comes with SF Pro, 4 px corners and no glow: the corners follow it, the rest stay.
    expect([look.font, look.corners, look.glow]).toEqual(['ny', 4, 70])
  })

  test('the stored look keeps a More look across a restart', async () => {
    let store = await fresh()
    store.pickLook('midnight')
    store = await fresh()
    expect(store.appearanceNow().picked).toBe('midnight')
    expect(store.appearanceNow().look.basedOn).toBe('midnight')
    expect(token('--accent')).toBe('#E8C36A')
  })

  test('High contrast turns the lines strong, and the next look puts them back', async () => {
    const store = await fresh()
    store.pickLook('contrast')
    expect(store.appearanceNow().look.lines).toBe('strong')
    store.pickLook('dusk')
    expect(store.appearanceNow().look.lines).toBe('standard')
  })

  test('save as a look, pick it again, and remove it', async () => {
    const store = await fresh()
    store.setLook({ ...store.appearanceNow().look, accent: 'mint', glow: 60 })
    expect(store.canSave()).toBe(true)
    const r = store.saveCurrent('Minty')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(store.appearanceNow().picked).toBe(`saved:${r.look.id}`)
    expect(store.lookName()).toBe('Minty')
    expect(store.canSave()).toBe(false)
    // A second one by the same name gets a number.
    store.setLook({ ...store.appearanceNow().look, glow: 61 })
    expect(store.lookName()).toBe('Custom, based on Minty')
    const second = store.saveCurrent('Minty')
    expect(second.ok && second.look.name).toBe('Minty 2')

    store.pickLook('tearsheet')
    store.pickLook(`saved:${r.look.id}`)
    expect(store.appearanceNow().look.glow).toBe(60)
    expect(JSON.parse(localStorage.getItem('appearance.saved')!)).toHaveLength(2)

    store.removeSaved(r.look.id)
    expect(store.appearanceNow().saved.map((s) => s.name)).toEqual(['Minty 2'])
    expect(store.appearanceNow().picked).toBe('tearsheet')
  })

  test('saved looks survive a restart', async () => {
    const store = await fresh()
    store.setLook({ ...store.appearanceNow().look, accent: 'violet' })
    store.saveCurrent('Violet hour')
    const again = await fresh()
    expect(again.appearanceNow().saved.map((s) => s.name)).toEqual(['Violet hour'])
    expect(again.lookName()).toBe('Violet hour')
  })

  test('at most 24 saved looks', async () => {
    const store = await fresh()
    for (let i = 0; i < store.SAVED_MAX; i++) {
      store.setLook({ ...store.appearanceNow().look, glow: i % 2 ? 10 : 20 })
      expect(store.saveCurrent(`Look ${i}`).ok).toBe(true)
    }
    const r = store.saveCurrent('One more')
    expect(r).toEqual({ ok: false, message: 'You have 24 saved looks, the most Tearsheet keeps. Remove one first.' })
    expect(store.importTheme(themeText(DEFAULT_APPEARANCE, 'X')).ok).toBe(false)
  })
})

describe('import, reset and undo', () => {
  test('a good file joins the looks and goes on at once; Undo puts everything back', async () => {
    const store = await fresh()
    const r = store.importTheme(themeText({ ...DEFAULT_APPEARANCE, basedOn: 'amber', glow: 15 }, 'Trading floor'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.name).toBe('Trading floor')
    expect(r.skipped).toBe(0)
    expect(store.appearanceNow().look.basedOn).toBe('amber')
    expect(store.lookName()).toBe('Trading floor')
    expect(token('--glow')).toBe('.15')

    store.restore(r.before)
    expect(store.appearanceNow().look).toEqual(DEFAULT_APPEARANCE)
    expect(store.appearanceNow().saved).toEqual([])
  })

  test('a file with odd parts still imports, and says how many were skipped', async () => {
    const store = await fresh()
    const r = store.importTheme('{"tearsheet-theme":1,"name":"","script":"alert(1)","colours":{"text":"red"},"glow":30}')
    expect(r).toMatchObject({ ok: true, name: 'Imported look', skipped: 2 })
  })

  test('a broken file changes nothing', async () => {
    const store = await fresh()
    const before = store.appearanceNow()
    expect(store.importTheme('{"tearsheet-theme": 1, "colours": {')).toEqual({ ok: false, message: 'That file couldn’t be read as a Tearsheet theme. Nothing changed.' })
    expect(store.appearanceNow()).toBe(before)
  })

  test('reset goes back to Tearsheet’s own look and keeps the saved looks', async () => {
    const store = await fresh()
    store.setLook({ ...store.appearanceNow().look, basedOn: 'dusk', glow: 90 })
    store.saveCurrent('Mine')
    const before = store.resetLook()
    expect(store.appearanceNow().look).toEqual(DEFAULT_APPEARANCE)
    expect(store.appearanceNow().picked).toBe('tearsheet')
    expect(store.appearanceNow().saved).toHaveLength(1)
    store.restore(before)
    expect(store.appearanceNow().look.glow).toBe(90)
  })
})

test('reloadAppearance reads storage again', async () => {
  const store = await fresh()
  localStorage.setItem('appearance.look', themeText({ ...DEFAULT_APPEARANCE, glow: 5 }, ''))
  store.reloadAppearance()
  expect(store.appearanceNow().look.glow).toBe(5)
})
