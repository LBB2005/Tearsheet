// The setup log (first-run design §7, item 8): <data folder>/logs/setup.log, one timestamped line
// per event, so a friend's failed setup can be read afterwards. Only the events and fields below
// are written, and none of §7's personal data: before a value is written the home folder becomes
// ~, and emails, links and anything long enough to be a key or an ID become [removed]. The window
// sends no entries of its own; every failure is already visible in the main process.

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'

export const SETUP_EVENTS = [
  'path_source',
  'test_rules',
  'status_read',
  'install_step',
  'step_blocked',
  'another_copy_found',
  'sign_in_link_opened',
  'copy_terminal',
  'key_check',
  'install_switch_read',
  'engine_restart_cap',
  // A release build was started with development hooks set; `value` is how many were ignored.
  'dev_hooks_ignored'
] as const

export const SETUP_FIELDS = [
  'tool',
  'state',
  'plan',
  'path',
  'exit',
  'signal',
  'ms',
  'step',
  'status',
  'reason_code',
  'source',
  'copied',
  'opened',
  'code',
  'value',
  'test_mode',
  'no_real_installers'
] as const

export type SetupEvent = (typeof SETUP_EVENTS)[number]
export type SetupField = (typeof SETUP_FIELDS)[number]
export type SetupFields = Partial<Record<SetupField, string | number | boolean | null | undefined>>

export interface SetupLog {
  log(event: SetupEvent, fields?: SetupFields): void
}

// For callers given no log (tests, and modules used before the data folder is known).
export const NO_LOG: SetupLog = { log: () => undefined }

const EVENTS: ReadonlySet<string> = new Set(SETUP_EVENTS)
const FIELDS: ReadonlySet<string> = new Set(SETUP_FIELDS)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A value as it may be written: the home folder as ~, then links, emails and long runs (Massive
// and FRED keys, sk- keys, account and organisation IDs) removed.
export function redact(value: string, home: string): string {
  let out = value
  const base = home.replace(/\/+$/, '')
  if (base) out = out.replace(new RegExp(`${escape(base)}(?=/|$|\\s|["'])`, 'g'), '~')
  return out
    .replace(/https?:\/\/\S+/g, '[removed]')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[removed]')
    .replace(/[A-Za-z0-9_-]{20,}/g, '[removed]')
}

// One line: the time, the event, then each field as name=value. A value with a space or a quote
// in it is written quoted.
export function formatEntry(at: Date, event: string, fields: SetupFields, home: string): string | null {
  if (!EVENTS.has(event)) return null
  const parts = [at.toISOString(), event]
  for (const [name, raw] of Object.entries(fields)) {
    if (!FIELDS.has(name) || raw === undefined || raw === null) continue
    if (typeof raw === 'number' && !Number.isFinite(raw)) continue
    const text = typeof raw === 'string' ? redact(raw, home) : String(raw)
    parts.push(`${name}=${/^[^\s"=]+$/.test(text) ? text : JSON.stringify(text)}`)
  }
  return parts.join(' ')
}

export interface SetupLogOptions {
  home?: string
  now?: () => Date
}

// A log that can't be written (a removed or locked logs folder) never throws: setup goes on.
export function createSetupLog(file: string, options: SetupLogOptions = {}): SetupLog {
  const home = options.home ?? homedir()
  const now = options.now ?? (() => new Date())
  return {
    log(event, fields = {}) {
      const line = formatEntry(now(), event, fields, home)
      if (line === null) return
      try {
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(file, `${line}\n`)
      } catch {
        // kept as best it can be
      }
    }
  }
}
