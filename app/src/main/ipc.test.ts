import { EventEmitter } from 'node:events'

import { afterEach, expect, test, vi } from 'vitest'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
const opened = vi.hoisted(() => [] as string[])
vi.mock('electron', () => ({
  BrowserWindow: class {},
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) },
  shell: { openExternal: async (url: string) => void opened.push(url) }
}))

import type { BrowserWindow } from 'electron'

import type { Engine } from './engine'
import { engineMethod, findRequest, registerIpc } from './ipc'

test('the call list is closed', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(engineMethod(name)).toBeNull()
  expect(engineMethod(42)).toBeNull()
  expect(engineMethod('getReport')).toBe('get_report')
})

test('the report’s numbers have a call of their own', () => {
  expect(engineMethod('getReportNumbers')).toBe('get_report_numbers')
  expect(engineMethod('getAnalysts')).toBe('get_analysts')
})

test('the sidebar’s delete and pin calls reach the engine', () => {
  expect(engineMethod('hideReports')).toBe('hide_reports')
  expect(engineMethod('showReports')).toBe('show_reports')
  expect(engineMethod('eraseReports')).toBe('erase_reports')
  expect(engineMethod('pinCompany')).toBe('pin_company')
  expect(engineMethod('planLine')).toBe('plan_line')
  expect(engineMethod('addToLine')).toBe('add_to_line')
  expect(engineMethod('getLine')).toBe('get_line')
  expect(engineMethod('removeFromLine')).toBe('remove_from_line')
  expect(engineMethod('clearLine')).toBe('clear_line')
  expect(engineMethod('carryOnLine')).toBe('carry_on_line')
  expect(engineMethod('lineGroups')).toBe('line_groups')
})

test('a new or changed query starts a find session, and the same query steps through it', () => {
  expect(findRequest(null, 'Hold', true)).toEqual({ text: 'Hold', forward: true, findNext: true })
  expect(findRequest('Hold', 'Hold', true)).toEqual({ text: 'Hold', forward: true, findNext: false })
  expect(findRequest('Hold', 'Hold', false)).toEqual({ text: 'Hold', forward: false, findNext: false })
  expect(findRequest('Hol', 'Hold', true)?.findNext).toBe(true)
})

test('a find needs some text, goes forward unless told otherwise, and is capped at 200 characters', () => {
  expect(findRequest(null, '', true)).toBeNull()
  expect(findRequest(null, 42, true)).toBeNull()
  expect(findRequest(null, 'a', undefined)?.forward).toBe(true)
  const long = 'x'.repeat(250)
  expect(findRequest(null, long, true)?.text).toHaveLength(200)
  expect(findRequest('x'.repeat(200), long, true)?.findNext).toBe(false)
})

// A window as Electron gives it: once it has closed, even reading its webContents throws
// "Object has been destroyed".
function openWindow() {
  let destroyed = false
  const contents = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    findInPage: vi.fn(() => 1),
    stopFindInPage: vi.fn(),
    isDestroyed: () => destroyed
  })
  const window = {
    isDestroyed: () => destroyed,
    get webContents() {
      if (destroyed) throw new TypeError('Object has been destroyed')
      return contents
    }
  }
  const close = () => {
    destroyed = true
  }
  return { window: window as unknown as BrowserWindow, contents, close }
}

function wired() {
  const { window, contents, close } = openWindow()
  const engine = Object.assign(new EventEmitter(), { fatalMessage: null }) as unknown as Engine
  registerIpc(window, engine, '/usr/bin')
  return { engine, contents, close }
}

afterEach(() => {
  handlers.clear()
  vi.useRealTimers()
})

test('the engine’s notes reach the open window', () => {
  const { engine, contents } = wired()
  const note = { method: 'progress', params: { step: 3 } }
  engine.emit('notification', note)
  engine.emit('crashed', 'run-1')
  engine.emit('fatal', 'The engine couldn’t start.')
  expect(contents.send.mock.calls).toEqual([
    ['tearsheet:notification', note],
    ['tearsheet:notification', { method: 'engine_restarted', params: { run_id: 'run-1' } }],
    ['tearsheet:notification', { method: 'engine_fatal', params: { message: 'The engine couldn’t start.' } }]
  ])
})

// Quitting while a report runs: the window closes while the engine is still stopping, and the
// report's last progress notes arrive after it. Sending them threw in the main process, and
// Electron's error box then held the quit up.
test('notes that arrive after the window has closed are dropped, not thrown', () => {
  const { engine, contents, close } = wired()
  close()
  expect(() => engine.emit('notification', { method: 'run_tally', params: {} })).not.toThrow()
  expect(() => engine.emit('crashed', 'run-1')).not.toThrow()
  expect(() => engine.emit('fatal', 'The engine stopped.')).not.toThrow()
  expect(contents.send).not.toHaveBeenCalled()
})

test('a find still waiting when the window closes ends quietly', async () => {
  vi.useFakeTimers()
  const { close } = wired()
  const found = handlers.get('tearsheet:find')!({}, 'Hold', true) as Promise<void>
  close()
  expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  await expect(found).resolves.toBeUndefined()
})

test('About and help gets the versions, and Send feedback opens a filled-in email', async () => {
  const { window } = openWindow()
  const engine = Object.assign(new EventEmitter(), { fatalMessage: null }) as unknown as Engine
  const info = { app: '0.1.0', engine: '0.1.0', macos: '26.1', electron: '33.2.0' }
  registerIpc(window, engine, '/usr/bin', () => info)
  expect(handlers.get('tearsheet:about')!()).toEqual(info)
  opened.length = 0
  expect(await handlers.get('tearsheet:sendFeedback')!()).toBe(true)
  expect(opened).toHaveLength(1)
  expect(opened[0].startsWith('mailto:')).toBe(true)
  expect(decodeURIComponent(opened[0])).toContain('Tearsheet 0.1.0')
})
