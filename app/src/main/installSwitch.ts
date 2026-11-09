// The online off switch (first-run design §2 "Two switches", item 29), for copies already handed
// out. Once each time Tearsheet opens, the main process reads release/install-button.txt from the
// public repository (SWITCH_URL; in test mode only TEARSHEET_SWITCH_URL, or nothing): a plain GET
// with no cookies and a 5-second limit. After trimming whitespace the body counts only if it is
// exactly `on` or `off`. A value that counts is saved with the date to
// <data folder>/install-switch.json, and the read is logged as install_switch_read.
//
// "The button is on" is INSTALL_BUTTON and the value saved before this launch isn't `off`, so a
// fresh value takes effect at the next launch and a button never disappears from under the
// pointer. An Install pressed after a fresh `off` is refused. A copy that can't reach the file
// keeps the last value it read; one that has never read it uses its build's setting. Neither
// switch can turn the button on alone.
//
// It takes INSTALL_BUTTON and SWITCH_URL as options: only index.ts imports shared/flags.ts.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { NO_LOG, type SetupLog } from './setupLog'

export type SwitchValue = 'on' | 'off'

// What install-switch.json holds. scripts/try-new-user.sh --switch-off writes the same shape.
export interface SavedSwitch {
  value: SwitchValue
  date: string
}

export const SWITCH_FILE = 'install-switch.json'
export const SWITCH_LIMIT_MS = 5000

// The request, as Electron's net.fetch takes it: a plain GET, no cookies, nothing cached.
export interface SwitchRequest {
  method: 'GET'
  credentials: 'omit'
  cache: 'no-store'
  signal: AbortSignal
}

export interface SwitchResponse {
  ok: boolean
  status?: number
  text(): Promise<string>
}

export type SwitchFetch = (url: string, init: SwitchRequest) => Promise<SwitchResponse>

// The body counts only if, after trimming whitespace, it is exactly `on` or `off`.
export function parseSwitch(body: string): SwitchValue | null {
  const value = body.trim()
  return value === 'on' || value === 'off' ? value : null
}

// Where this launch reads the switch: SWITCH_URL, or in test mode only TEARSHEET_SWITCH_URL (or
// nowhere), so a test copy never reaches the real address.
export function switchAddress(testMode: boolean, env: NodeJS.ProcessEnv, switchUrl: string): string | null {
  if (!testMode) return switchUrl
  const url = env.TEARSHEET_SWITCH_URL?.trim()
  return url ? url : null
}

// The value saved by an earlier launch, or null when there is none or it isn't `on` or `off`.
export function readSavedSwitch(dataDir: string): SavedSwitch | null {
  try {
    const data: unknown = JSON.parse(readFileSync(join(dataDir, SWITCH_FILE), 'utf8'))
    if (!data || typeof data !== 'object') return null
    const { value, date } = data as { value?: unknown; date?: unknown }
    if (value !== 'on' && value !== 'off') return null
    return { value, date: typeof date === 'string' ? date : '' }
  } catch {
    return null
  }
}

// Written to a new file, then moved into place, so a half-written file is never read.
export function saveSwitch(dataDir: string, saved: SavedSwitch): boolean {
  const file = join(dataDir, SWITCH_FILE)
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(`${file}.${process.pid}`, `${JSON.stringify(saved)}\n`)
    renameSync(`${file}.${process.pid}`, file)
    return true
  } catch {
    return false
  }
}

export interface InstallSwitchOptions {
  // The data folder (TEARSHEET_DATA_DIR), which holds install-switch.json.
  dataDir: string
  // INSTALL_BUTTON and SWITCH_URL (shared/flags.ts), passed in by index.ts.
  installButton: boolean
  switchUrl: string
  // testMode(process.env) (tools.ts), and the environment for TEARSHEET_SWITCH_URL.
  testMode: boolean
  env?: NodeJS.ProcessEnv
  // Electron's net.fetch, faked in tests.
  fetch: SwitchFetch
  log?: SetupLog
  limitMs?: number
  now?: () => Date
}

interface Fetched {
  value: SwitchValue | null
  reason?: 'timeout' | 'fetch_failed' | 'http_status' | 'not_on_or_off'
  status?: number
}

export class InstallSwitch {
  // The value saved before this launch, read once, before this launch's own read.
  private readonly saved: SavedSwitch | null
  private fresh: SwitchValue | null = null
  private underway: Promise<SwitchValue | null> | null = null

  constructor(private readonly options: InstallSwitchOptions) {
    this.saved = readSavedSwitch(options.dataDir)
  }

  // "The button is on": the build's switch, and the value saved before this launch isn't `off`.
  getInstallButton(): boolean {
    return this.options.installButton && this.saved?.value !== 'off'
  }

  // Whether an install call is taken now: the button is on, and this launch's fresh value (if it
  // has arrived) isn't `off` either.
  allowsInstall(): boolean {
    return this.getInstallButton() && this.fresh !== 'off'
  }

  // The launch read. Called once at launch; a second call shares the first.
  read(): Promise<SwitchValue | null> {
    this.underway ??= this.readOnce()
    return this.underway
  }

  private async readOnce(): Promise<SwitchValue | null> {
    const { testMode, env = process.env, switchUrl, dataDir } = this.options
    const log = this.options.log ?? NO_LOG
    const url = switchAddress(testMode, env, switchUrl)
    const source = testMode ? 'test_switch_url' : 'switch_url'
    if (!url) {
      log.log('install_switch_read', { source: 'none', reason_code: 'no_url', test_mode: testMode })
      return null
    }
    const startedAt = Date.now()
    const got = await this.fetchValue(url)
    const ms = Date.now() - startedAt
    if (got.value === null) {
      log.log('install_switch_read', { source, reason_code: got.reason, code: got.status, ms, test_mode: testMode })
      return null
    }
    this.fresh = got.value
    const saved = saveSwitch(dataDir, { value: got.value, date: (this.options.now ?? (() => new Date()))().toISOString() })
    log.log('install_switch_read', { source, value: got.value, ms, reason_code: saved ? undefined : 'save_failed', test_mode: testMode })
    return got.value
  }

  private async fetchValue(url: string): Promise<Fetched> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<Fetched>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve({ value: null, reason: 'timeout' })
      }, this.options.limitMs ?? SWITCH_LIMIT_MS)
    })
    const fetched = (async (): Promise<Fetched> => {
      const response = await this.options.fetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal })
      if (!response.ok) return { value: null, reason: 'http_status', status: response.status }
      const value = parseSwitch(await response.text())
      return value ? { value } : { value: null, reason: 'not_on_or_off' }
    })()
    const answer = await Promise.race([fetched, timeout]).catch((): Fetched => ({ value: null, reason: 'fetch_failed' }))
    clearTimeout(timer)
    return answer
  }
}
