// Pure logic for Settings (pages/Settings.tsx, the spec's "Settings and connections"): the four
// health tiles, each AI tool's pill, the storage bar, and the small ways values are written and
// checked before they are saved.

import type { ToolStatus } from '../../preload/api'
import type { Keys, LockdownState } from '../../shared/protocol'
import { safetyFailed, safetyUnfinished } from '../nav'
import { isEmail } from '../../shared/tools'
import { TOOL_TEXT, type SafetyState, type ToolKind } from '../setup/steps'

// ok green, hold amber, bad red, run accent (something under way), off grey (nothing wrong).
export type Tone = 'ok' | 'hold' | 'bad' | 'run' | 'off'

export interface Tile {
  name: string
  tone: Tone
  text: string
}

// The engine warns about the raw-data folder from this share of its cap (config.RAW_CAP_WARN_SHARE).
const WARN_SHARE = 0.9
const MB = 1024 ** 2
const GB = 1024 ** 3

// A number with at most one decimal, and none when it is whole: 2.5, 5, 0.3.
const short = (n: number) => String(Number(n.toFixed(1)))

function sizeText(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 10 * MB) return `${short(bytes / MB)} MB`
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`
  return `${short(bytes / GB)} GB`
}

export interface Storage {
  used: string
  cap: string
  // "0.3% of the cap"
  share: string
  // The bar's filled width, as CSS: never past the end.
  width: string
  tone: 'ok' | 'hold'
  // Past the cap (the engine prunes nothing yet, so it only warns).
  over: boolean
}

// The raw downloads against their cap (in GB), for the storage bar and its tile.
export function storage(rawBytes: number, capGb: number): Storage {
  const used = sizeText(rawBytes)
  const cap = `${short(capGb)} GB`
  if (!(capGb > 0)) return { used, cap, share: '', width: '0%', tone: 'ok', over: false }
  const part = Math.max(0, rawBytes) / (capGb * GB)
  const pct = part * 100
  const share = part === 0 ? '0%' : pct < 0.1 ? 'under 0.1%' : pct < 10 ? `${short(pct)}%` : `${Math.round(pct)}%`
  return { used, cap, share: `${share} of the cap`, width: `${Math.round(Math.min(100, pct) * 100) / 100}%`, tone: part >= WARN_SHARE ? 'hold' : 'ok', over: part > 1 }
}

// Whether a stored lock-down check makes the tool unusable: the same rule as lockdownText's
// "Not usable with Tearsheet" line, so the pill and the line agree.
const storedNotUsable = (state: LockdownState | undefined) => Boolean(state && (state.blocked_reason === 'lockdown_failed' || (!state.passed && state.form === 'full')))

const runningFor = (safety: SafetyState | null, kind: ToolKind) => (safety && safety.tool === kind && !safety.done ? safety : null)

// The pill on each AI tool's row, by what its status read found (shared/tools.ts), so it agrees
// with the row's action. This session's safety check, when one ran for the tool, outranks the
// check stored before it.
export function toolPill(tool: ToolStatus, stored: LockdownState | undefined, safety: SafetyState | null): { tone: Tone; text: string } {
  if (tool.state === 'missing') return { tone: 'off', text: 'Not found' }
  if (tool.state === 'signed_out') return { tone: 'bad', text: 'Signed out' }
  if (tool.state === 'too_old') return { tone: 'bad', text: 'Too old' }
  if (tool.state === 'api_key') return { tone: 'bad', text: 'Not on a plan' }
  if (tool.state === 'free_plan') return { tone: 'bad', text: 'Free plan' }
  if (tool.state === 'cant_tell') return { tone: 'hold', text: 'Can’t tell' }
  if (runningFor(safety, tool.kind)) return { tone: 'run', text: 'Checking' }
  // A check that stopped part way gave no verdict, so the stored one stands.
  const session = safety && safety.tool === tool.kind && safety.done && !safety.stopped ? safety : null
  const notUsable = session ? !session.passed : storedNotUsable(stored)
  return notUsable ? { tone: 'bad', text: 'Not usable' } : { tone: 'ok', text: 'Ready' }
}

export interface HealthInput {
  // As the probe found them; empty until it answers.
  tools: ToolStatus[]
  // The main AI tool (primary_tool, or Claude Code).
  primary: ToolKind
  lockdown: Record<string, LockdownState>
  // This session's safety check, if one ran.
  safety: SafetyState | null
  // Set, missing, or locked (macOS didn't let Tearsheet open it this session).
  keys: Keys
  // Stored keys their service refused on the last call that used them.
  rejected?: string[]
  rawBytes: number
  rawCap: number
  // Codex billed to an API key (codex_billing set to api). The settings don't say, and
  // set-setting can't set it, so it is off unless a caller knows better.
  codexApi?: boolean
}

// The keys reports use, in the order the tile names them. Alpha Vantage isn't used yet.
const USED_KEYS: [string, string][] = [
  ['massive', 'Massive'],
  ['fred', 'FRED']
]

// The four health tiles: the AI tool, the data keys, storage, and the other-tool skeptic.
export function healthTiles(h: HealthInput): Tile[] {
  const name = TOOL_TEXT[h.primary].name
  const main = h.tools.find((t) => t.kind === h.primary)
  let ai: Tile
  if (!main) ai = { name: 'AI tool', tone: 'off', text: `Looking for ${name}…` }
  else if (!main.available) ai = { name: 'AI tool', tone: 'bad', text: `${name} not found` }
  else if (main.loggedIn === false) ai = { name: 'AI tool', tone: 'bad', text: `${name} signed out` }
  else if (safetyFailed(h.safety, h.primary, h.lockdown[h.primary])) ai = { name: 'AI tool', tone: 'bad', text: 'Safety check didn’t pass' }
  else if (safetyUnfinished(h.safety, h.primary)) ai = { name: 'AI tool', tone: 'off', text: 'Safety check didn’t finish' }
  else {
    const running = runningFor(h.safety, h.primary)
    ai = running ? { name: 'AI tool', tone: 'run', text: `Safety check, ${running.n} of ${running.total}` } : { name: 'AI tool', tone: 'ok', text: `${name} ready` }
  }

  const locked = USED_KEYS.filter(([service]) => h.keys[service] === 'locked').map(([, label]) => `${label}’s`)
  const missing = USED_KEYS.filter(([service]) => h.keys[service] !== 'set' && h.keys[service] !== 'locked').map(([, label]) => label)
  const refused = USED_KEYS.filter(([service]) => h.keys[service] === 'set' && h.rejected?.includes(service)).map(([, label]) => `${label}’s`)
  const count = `${USED_KEYS.length - missing.length - locked.length} of ${USED_KEYS.length} set`
  const massiveOk = h.keys.massive === 'set' && !h.rejected?.includes('massive')
  const keys: Tile =
    locked.length > 0
      ? { name: 'Data keys', tone: massiveOk ? 'hold' : 'bad', text: locked.length === 1 ? `${locked[0]} key is locked in the Keychain` : `${locked.join(' and ')} keys are locked in the Keychain` }
      : missing.length > 0
        ? { name: 'Data keys', tone: massiveOk ? 'hold' : 'bad', text: `${count}, ${missing.join(' and ')} missing` }
        : refused.length > 0
          ? { name: 'Data keys', tone: massiveOk ? 'hold' : 'bad', text: refused.length === 1 ? `${refused[0]} key isn’t accepted` : `${refused.join(' and ')} keys aren’t accepted` }
          : { name: 'Data keys', tone: 'ok', text: count }

  const store = storage(h.rawBytes, h.rawCap)
  const space: Tile = { name: 'Storage', tone: store.tone, text: `${store.used} of ${store.cap}` }

  // The skeptic runs on the other tool when it is found and hasn't failed its check (the
  // engine's ai.checker_for); otherwise a fresh session of the main tool checks the drafts.
  const otherKind: ToolKind = h.primary === 'claude' ? 'codex' : 'claude'
  const otherName = TOOL_TEXT[otherKind].name
  const other = h.tools.find((t) => t.kind === otherKind)
  const checking = runningFor(h.safety, otherKind)
  let skeptic: Tile
  if (!other) skeptic = { name: 'Other-tool skeptic', tone: 'off', text: `Looking for ${otherName}…` }
  else if (!other.available) skeptic = { name: 'Other-tool skeptic', tone: 'off', text: `Off: ${otherName} isn’t installed` }
  else if (safetyFailed(h.safety, otherKind, h.lockdown[otherKind])) skeptic = { name: 'Other-tool skeptic', tone: 'bad', text: `Off: ${otherName} failed its check` }
  else if (other.state === 'signed_out') skeptic = { name: 'Other-tool skeptic', tone: 'hold', text: `Off: ${otherName} is signed out` }
  // Codex checks drafts only on a ChatGPT sign-in, unless it is billed to an API key: the
  // engine's rule (ai/client.py), which steps down to the writing tool before any call.
  else if (otherKind === 'codex' && other.state !== 'ready' && !h.codexApi) skeptic = { name: 'Other-tool skeptic', tone: 'hold', text: 'Off: Codex isn’t signed in with ChatGPT' }
  else if (checking) skeptic = { name: 'Other-tool skeptic', tone: 'run', text: `Checking ${otherName}, ${checking.n} of ${checking.total}` }
  else skeptic = { name: 'Other-tool skeptic', tone: 'ok', text: `On: ${otherName} checks the drafts` }

  return [ai, keys, space, skeptic]
}

// The SEC email as the prototype shows it: the first letter and the domain.
export function maskEmail(email: string): string {
  const e = email.trim()
  const at = e.indexOf('@')
  return at < 0 ? `${e.slice(0, 1)}••••••••` : `${e.slice(0, 1)}••••••••${e.slice(at)}`
}

// The general settings typed in a field (the main AI tool is a choice, not typed).
export type FieldKey = 'sec_contact_email' | 'backup_dir' | 'goal1_round' | 'raw_cap'

// What is wrong with a value before it is saved, or null. The engine checks again.
export function fieldProblem(key: FieldKey, value: string): string | null {
  const v = value.trim()
  if (key === 'sec_contact_email') return isEmail(v) ? null : 'That doesn’t look like an email address.'
  if (key === 'backup_dir') return v ? null : 'Give the folder’s path, like ~/Tearsheet Backups.'
  if (key === 'goal1_round') return /^\d+$/.test(v) && Number(v) >= 1 ? null : 'Give a whole number, 1 or more.'
  const n = Number(v)
  return v !== '' && Number.isFinite(n) && n > 0 ? null : 'Give a size in GB, more than 0.'
}
