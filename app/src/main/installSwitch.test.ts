// installSwitch.ts with a fake fetch and a scratch data folder: nothing is fetched for real, and
// the real SWITCH_URL is only ever handed to a fake.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SWITCH_URL } from '../shared/flags'
import { InstallSwitch, parseSwitch, readSavedSwitch, saveSwitch, switchAddress, SWITCH_FILE, type InstallSwitchOptions, type SwitchFetch, type SwitchRequest } from './installSwitch'
import type { SetupEvent, SetupFields } from './setupLog'

const URL = 'https://example.test/install-button.txt'
const AT = new Date('2026-11-08T12:00:00.000Z')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-switch-test-'))
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

const answering = (body: string, ok = true, status = 200) => vi.fn<SwitchFetch>(async () => ({ ok, status, text: async () => body }))

function logger() {
  const entries: [SetupEvent, SetupFields][] = []
  return { entries, log: { log: (event: SetupEvent, fields: SetupFields = {}) => void entries.push([event, fields]) } }
}

const saveBefore = (value: string) => writeFileSync(join(dir, SWITCH_FILE), `{"value": "${value}", "date": "2026-11-01T09:00:00Z"}\n`)
const savedNow = () => readSavedSwitch(dir)

function make(fetch: SwitchFetch, more: Partial<InstallSwitchOptions> = {}) {
  const { entries, log } = logger()
  const sw = new InstallSwitch({ dataDir: dir, installButton: true, switchUrl: URL, testMode: false, env: {}, fetch, log, now: () => AT, ...more })
  return { sw, entries }
}

describe('parseSwitch', () => {
  it('counts only exactly on or off, after trimming whitespace', () => {
    expect(parseSwitch('on')).toBe('on')
    expect(parseSwitch('off')).toBe('off')
    expect(parseSwitch('off\n')).toBe('off')
    expect(parseSwitch('  on \r\n')).toBe('on')
    for (const other of ['', 'On', 'OFF', 'on please', 'of', '"on"', '<html>404</html>', 'on\noff']) expect(parseSwitch(other)).toBeNull()
  })
})

describe('the launch read', () => {
  it('on: saved with the date, logged, and the button stays on', async () => {
    const fetch = answering('on')
    const { sw, entries } = make(fetch)
    expect(await sw.read()).toBe('on')
    expect(savedNow()).toEqual({ value: 'on', date: AT.toISOString() })
    expect(sw.getInstallButton()).toBe(true)
    expect(sw.allowsInstall()).toBe(true)
    expect(entries).toEqual([['install_switch_read', { source: 'switch_url', value: 'on', ms: expect.any(Number), reason_code: undefined, test_mode: false }]])
  })

  it('a plain GET with no cookies, nothing cached, and a way to stop it', async () => {
    const fetch = answering('on')
    await make(fetch).sw.read()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as [string, SwitchRequest]
    expect(url).toBe(URL)
    expect(init).toEqual({ method: 'GET', credentials: 'omit', cache: 'no-store', signal: expect.any(AbortSignal) })
  })

  it('off: saved, but the button keeps this launch’s answer, and an install is refused now', async () => {
    const { sw } = make(answering('off'))
    expect(sw.getInstallButton()).toBe(true)
    expect(await sw.read()).toBe('off')
    expect(savedNow()).toEqual({ value: 'off', date: AT.toISOString() })
    // A fresh value takes effect at the next launch, so the button doesn't disappear now…
    expect(sw.getInstallButton()).toBe(true)
    // …but an Install pressed after it is refused.
    expect(sw.allowsInstall()).toBe(false)
    // The next launch reads the saved off.
    expect(make(answering('off')).sw.getInstallButton()).toBe(false)
  })

  it('off with a newline counts as off', async () => {
    const { sw } = make(answering('off\n'))
    expect(await sw.read()).toBe('off')
    expect(sw.allowsInstall()).toBe(false)
    expect(savedNow()?.value).toBe('off')
  })

  it('any other text doesn’t count, isn’t saved, and leaves the saved value', async () => {
    saveBefore('on')
    const { sw, entries } = make(answering('Off'))
    expect(await sw.read()).toBeNull()
    expect(savedNow()).toEqual({ value: 'on', date: '2026-11-01T09:00:00Z' })
    expect(sw.getInstallButton()).toBe(true)
    expect(sw.allowsInstall()).toBe(true)
    expect(entries).toEqual([['install_switch_read', { source: 'switch_url', reason_code: 'not_on_or_off', code: undefined, ms: expect.any(Number), test_mode: false }]])
  })

  it('a page that isn’t found doesn’t count, even if it says off', async () => {
    const { sw, entries } = make(answering('off', false, 404))
    expect(await sw.read()).toBeNull()
    expect(savedNow()).toBeNull()
    expect(sw.allowsInstall()).toBe(true)
    expect(entries[0][1]).toMatchObject({ reason_code: 'http_status', code: 404 })
  })

  it('a timeout: stopped after the limit, nothing saved, and the saved value used', async () => {
    vi.useFakeTimers()
    saveBefore('off')
    let signal: AbortSignal | undefined
    const fetch = vi.fn<SwitchFetch>((_url, init) => {
      signal = init.signal
      return new Promise(() => undefined)
    })
    const { sw, entries } = make(fetch, { limitMs: 5000 })
    const read = sw.read()
    await vi.advanceTimersByTimeAsync(4999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await read).toBeNull()
    expect(signal?.aborted).toBe(true)
    expect(savedNow()?.value).toBe('off')
    expect(sw.getInstallButton()).toBe(false)
    expect(entries[0][1]).toMatchObject({ reason_code: 'timeout' })
  })

  it('the limit is 5 seconds unless one is passed in', async () => {
    vi.useFakeTimers()
    const { sw } = make(vi.fn<SwitchFetch>(() => new Promise(() => undefined)), { limitMs: undefined })
    let done = false
    void sw.read().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(4999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it('offline: the saved value is used, either way', async () => {
    const offline = vi.fn<SwitchFetch>(async () => {
      throw new Error('net::ERR_INTERNET_DISCONNECTED')
    })
    saveBefore('off')
    const off = make(offline)
    expect(await off.sw.read()).toBeNull()
    expect(off.sw.getInstallButton()).toBe(false)
    expect(off.sw.allowsInstall()).toBe(false)
    expect(off.entries[0][1]).toMatchObject({ reason_code: 'fetch_failed' })
    saveBefore('on')
    const on = make(offline)
    await on.sw.read()
    expect(on.sw.getInstallButton()).toBe(true)
    expect(on.sw.allowsInstall()).toBe(true)
  })

  it('no saved value: the build’s setting', async () => {
    const offline = vi.fn<SwitchFetch>(async () => {
      throw new Error('offline')
    })
    const { sw } = make(offline)
    expect(savedNow()).toBeNull()
    expect(sw.getInstallButton()).toBe(true)
    await sw.read()
    expect(sw.allowsInstall()).toBe(true)
    expect(make(offline, { installButton: false }).sw.getInstallButton()).toBe(false)
  })

  it('the value saved before this launch decides the button, not one saved during it', async () => {
    saveBefore('off')
    const { sw } = make(answering('on'))
    expect(await sw.read()).toBe('on')
    expect(savedNow()?.value).toBe('on')
    expect(sw.getInstallButton()).toBe(false)
    expect(sw.allowsInstall()).toBe(false)
  })

  it('a saved or fresh on never shows the button when INSTALL_BUTTON is false', async () => {
    saveBefore('on')
    const saved = make(answering('on'), { installButton: false })
    expect(saved.sw.getInstallButton()).toBe(false)
    expect(saved.sw.allowsInstall()).toBe(false)
    expect(await saved.sw.read()).toBe('on')
    expect(saved.sw.getInstallButton()).toBe(false)
    expect(saved.sw.allowsInstall()).toBe(false)
  })

  it('read once per launch: a second call shares the first', async () => {
    const fetch = answering('on')
    const { sw } = make(fetch)
    const first = sw.read()
    expect(sw.read()).toBe(first)
    await first
    await sw.read()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('works with no log', async () => {
    const sw = new InstallSwitch({ dataDir: dir, installButton: true, switchUrl: URL, testMode: false, fetch: answering('on') })
    expect(await sw.read()).toBe('on')
  })

  it('a value that can’t be saved still counts for this launch, and the log says so', async () => {
    const blocked = join(dir, 'not-a-folder')
    writeFileSync(blocked, 'a file where the data folder should be')
    const { log, entries } = logger()
    const sw = new InstallSwitch({ dataDir: blocked, installButton: true, switchUrl: URL, testMode: false, env: {}, fetch: answering('off'), log })
    expect(await sw.read()).toBe('off')
    expect(sw.allowsInstall()).toBe(false)
    expect(entries[0][1]).toMatchObject({ value: 'off', reason_code: 'save_failed' })
  })
})

describe('test mode', () => {
  it('never reads SWITCH_URL: with no TEARSHEET_SWITCH_URL nothing is read', async () => {
    const fetch = answering('off')
    const { sw, entries } = make(fetch, { testMode: true, switchUrl: SWITCH_URL, env: {} })
    expect(await sw.read()).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(sw.allowsInstall()).toBe(true)
    expect(entries).toEqual([['install_switch_read', { source: 'none', reason_code: 'no_url', test_mode: true }]])
  })

  it('reads only TEARSHEET_SWITCH_URL when it is set', async () => {
    const fetch = answering('off')
    const { sw, entries } = make(fetch, { testMode: true, switchUrl: SWITCH_URL, env: { TEARSHEET_SWITCH_URL: 'http://127.0.0.1:8765/switch.txt' } })
    expect(await sw.read()).toBe('off')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:8765/switch.txt'])
    expect(entries[0][1]).toMatchObject({ source: 'test_switch_url', value: 'off', test_mode: true })
  })

  it('a saved off from the test script (--switch-off) turns the button off', () => {
    saveBefore('off')
    expect(make(answering('on'), { testMode: true }).sw.getInstallButton()).toBe(false)
  })

  it('outside test mode TEARSHEET_SWITCH_URL is ignored', () => {
    expect(switchAddress(false, { TEARSHEET_SWITCH_URL: 'http://127.0.0.1/x' }, URL)).toBe(URL)
    expect(switchAddress(true, { TEARSHEET_SWITCH_URL: '  ' }, SWITCH_URL)).toBeNull()
    expect(switchAddress(true, {}, SWITCH_URL)).toBeNull()
  })
})

describe('the saved file', () => {
  it('reads the value the test script writes, and nothing it doesn’t know', () => {
    saveBefore('off')
    expect(readSavedSwitch(dir)).toEqual({ value: 'off', date: '2026-11-01T09:00:00Z' })
    writeFileSync(join(dir, SWITCH_FILE), '{"value": "maybe"}')
    expect(readSavedSwitch(dir)).toBeNull()
    writeFileSync(join(dir, SWITCH_FILE), '{"value": "on"}')
    expect(readSavedSwitch(dir)).toEqual({ value: 'on', date: '' })
    writeFileSync(join(dir, SWITCH_FILE), 'null')
    expect(readSavedSwitch(dir)).toBeNull()
    writeFileSync(join(dir, SWITCH_FILE), 'not json')
    expect(readSavedSwitch(dir)).toBeNull()
  })

  it('writes { value, date } and creates the data folder', () => {
    const nested = join(dir, 'data')
    expect(saveSwitch(nested, { value: 'on', date: AT.toISOString() })).toBe(true)
    expect(JSON.parse(readFileSync(join(nested, SWITCH_FILE), 'utf8'))).toEqual({ value: 'on', date: AT.toISOString() })
  })
})
