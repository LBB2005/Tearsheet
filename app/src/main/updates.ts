// The update banner (prelaunch, 11 Nov 2026). Tearsheet isn't signed with an Apple Developer ID
// yet, so it can't update itself. Instead, at launch and at most once a day, the main process asks
// GitHub's public Releases API for the newest version: one plain GET with no cookies, nothing
// cached and a 5-second limit. If that version is newer than this copy (semver, so 0.1.0 is newer
// than 0.1.0-beta), the window shows a quiet banner: "Tearsheet X is out · Download · What's new ·
// Dismiss". Download opens the release page in the browser; Dismiss hides the banner for that
// version only. Offline, or on any odd answer, nothing happens and nothing is shown.
//
// What it keeps, in <userData>/updates.json: the "Check for updates" setting (on unless the person
// turns it off in Settings → About and help), when it last asked, the newest release it saw, and
// the version dismissed. Turned off, it never asks and never shows the banner.
//
// A signed release build updates itself with electron-updater instead (autoUpdate.ts); this file
// is what every other copy uses.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const REPO = 'LBB2005/Tearsheet'
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases`
// The only pages the banner opens. A release's own page must start with RELEASES_PAGE.
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/`
export const CHANGELOG_URL = `https://github.com/${REPO}/blob/main/CHANGELOG.md`

export const UPDATES_FILE = 'updates.json'
export const DAY_MS = 24 * 60 * 60 * 1000
export const UPDATE_LIMIT_MS = 5000

// ---------- versions ----------

export interface Version {
  major: number
  minor: number
  patch: number
  // The pre-release parts: "beta.2" is ['beta', '2']. Empty for a release.
  pre: string[]
}

const NUMERIC = /^(0|[1-9]\d*)$/
const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/

// A semver version, with or without a leading v ("v0.1.0-beta" as GitHub tags it). Build
// metadata (+...) is allowed and ignored. Anything else is null.
export function parseVersion(text: unknown): Version | null {
  if (typeof text !== 'string') return null
  const m = VERSION.exec(text.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [] }
}

function comparePart(a: string, b: string): number {
  const an = NUMERIC.test(a)
  const bn = NUMERIC.test(b)
  if (an && bn) return Math.sign(Number(a) - Number(b))
  // Numbers sort before words (semver §11).
  if (an) return -1
  if (bn) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

// -1, 0 or 1 by semver precedence (semver.org §11), or null if either isn't a version.
// 0.1.0-beta < 0.1.0-beta.2 < 0.1.0-rc.1 < 0.1.0 < 0.1.1.
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return null
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1
  }
  // A release is newer than any pre-release of the same version.
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const c = comparePart(x.pre[i], y.pre[i])
    if (c) return c < 0 ? -1 : 1
  }
  return x.pre.length === y.pre.length ? 0 : x.pre.length < y.pre.length ? -1 : 1
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) === 1
}

export function isPrerelease(version: string): boolean {
  return (parseVersion(version)?.pre.length ?? 0) > 0
}

// ---------- GitHub's answer ----------

export interface Release {
  // Without the v: "0.1.0".
  version: string
  // The release's page on github.com.
  url: string
  prerelease: boolean
}

function asRelease(item: unknown): Release | null {
  if (!item || typeof item !== 'object') return null
  const { tag_name, html_url, prerelease, draft } = item as Record<string, unknown>
  if (draft === true) return null
  const parsed = parseVersion(tag_name)
  if (!parsed || typeof html_url !== 'string' || !html_url.startsWith(RELEASES_PAGE)) return null
  const version = String(tag_name).trim().replace(/^v/, '').replace(/\+.*$/, '')
  return { version, url: html_url, prerelease: prerelease === true || parsed.pre.length > 0 }
}

// The newest release in GitHub's answer: one release (/releases/latest) or a list (/releases).
// Drafts, and tags that aren't versions, are skipped. Pre-releases count only when asked for:
// a copy that is itself a pre-release (today's 0.1.0-beta) is offered the next beta too.
export function pickRelease(body: unknown, withPrereleases: boolean): Release | null {
  const items = Array.isArray(body) ? body : [body]
  let best: Release | null = null
  for (const item of items) {
    const release = asRelease(item)
    if (!release || (release.prerelease && !withPrereleases)) continue
    if (!best || isNewer(release.version, best.version)) best = release
  }
  return best
}

// Where this copy asks: a release asks for the latest release; a pre-release asks for the list,
// since GitHub's /releases/latest never returns a pre-release. A test copy asks only
// TEARSHEET_RELEASES_URL, or nowhere, so it never reaches GitHub.
export function releasesAddress(current: string, testMode: boolean, env: NodeJS.ProcessEnv): string | null {
  if (testMode) return env.TEARSHEET_RELEASES_URL?.trim() || null
  return isPrerelease(current) ? `${RELEASES_API}?per_page=20` : `${RELEASES_API}/latest`
}

// ---------- what's kept ----------

export interface UpdateState {
  // "Check for updates" in Settings → About and help. On unless turned off.
  check: boolean
  // When it last asked GitHub (ISO time), whatever the answer.
  lastChecked: string | null
  // The newest release it has seen.
  latest: Release | null
  // The version whose banner was dismissed.
  dismissed: string | null
}

export const FRESH_STATE: UpdateState = { check: true, lastChecked: null, latest: null, dismissed: null }

export function readState(file: string): UpdateState {
  try {
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!data || typeof data !== 'object') return { ...FRESH_STATE }
    const d = data as Record<string, unknown>
    const latest = d.latest && typeof d.latest === 'object' ? asRelease({ tag_name: (d.latest as Release).version, html_url: (d.latest as Release).url, prerelease: (d.latest as Release).prerelease }) : null
    return {
      check: d.check !== false,
      lastChecked: typeof d.lastChecked === 'string' ? d.lastChecked : null,
      latest,
      dismissed: typeof d.dismissed === 'string' ? d.dismissed : null
    }
  } catch {
    return { ...FRESH_STATE }
  }
}

// Written to a new file, then moved into place, so a half-written file is never read.
export function saveState(file: string, state: UpdateState): boolean {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.${process.pid}`, `${JSON.stringify(state)}\n`)
    renameSync(`${file}.${process.pid}`, file)
    return true
  } catch {
    return false
  }
}

// Whether to ask now: the setting is on, and it hasn't asked in the last day. A time in the
// future (the clock was changed) counts as due.
export function checkDue(state: UpdateState, now: Date): boolean {
  if (!state.check) return false
  const last = state.lastChecked ? Date.parse(state.lastChecked) : NaN
  if (Number.isNaN(last)) return true
  const since = now.getTime() - last
  return since < 0 || since >= DAY_MS
}

// The banner's release, or null: the setting is on, the newest release seen is newer than this
// copy, and that version wasn't dismissed.
export function shownUpdate(state: UpdateState, current: string): Release | null {
  const latest = state.latest
  if (!state.check || !latest || !isNewer(latest.version, current)) return null
  if (state.dismissed && compareVersions(state.dismissed, latest.version) === 0) return null
  return latest
}

// ---------- the check ----------

export interface UpdateRequest {
  method: 'GET'
  credentials: 'omit'
  cache: 'no-store'
  signal: AbortSignal
}

export interface UpdateResponse {
  ok: boolean
  status?: number
  json(): Promise<unknown>
}

export type UpdateFetch = (url: string, init: UpdateRequest) => Promise<UpdateResponse>

// What the window is told: the setting, and the banner's release (or none).
export interface UpdateStatus {
  check: boolean
  update: Release | null
}

export interface UpdateCheckOptions {
  file: string
  // app.getVersion().
  current: string
  // releasesAddress(...); null means never ask.
  url: string | null
  // Electron's net.fetch, faked in tests.
  fetch: UpdateFetch
  // Told whenever the status changes (a release found, a dismiss, the setting).
  onChange?: (status: UpdateStatus) => void
  // A signed release build's electron-updater check (autoUpdate.ts), run on the same schedule in
  // place of the GitHub request; it shows no banner.
  instead?: () => Promise<unknown>
  now?: () => Date
  limitMs?: number
}

export class UpdateCheck {
  private state: UpdateState
  private underway: Promise<void> | null = null

  constructor(private readonly options: UpdateCheckOptions) {
    this.state = readState(options.file)
  }

  status(): UpdateStatus {
    return { check: this.state.check, update: shownUpdate(this.state, this.options.current) }
  }

  // The release the banner shows (for Download), or null.
  shown(): Release | null {
    return this.status().update
  }

  setCheck(on: boolean): UpdateStatus {
    this.update({ check: on })
    if (on) void this.run()
    return this.status()
  }

  // Hides the banner for this version only; a newer one shows again.
  dismiss(version: unknown): UpdateStatus {
    if (typeof version === 'string' && parseVersion(version)) this.update({ dismissed: version.replace(/^v/, '') })
    return this.status()
  }

  // Asks GitHub if it's due. Called at launch and then every hour; a second call while one is
  // under way shares it. Never throws.
  run(): Promise<void> {
    this.underway ??= this.runOnce().finally(() => {
      this.underway = null
    })
    return this.underway
  }

  private async runOnce(): Promise<void> {
    const now = (this.options.now ?? (() => new Date()))()
    const { url, instead } = this.options
    if ((!url && !instead) || !checkDue(this.state, now)) return
    // Kept before the answer, so a check that fails (offline) waits a day too.
    this.update({ lastChecked: now.toISOString() }, false)
    if (instead) {
      await instead().catch(() => undefined)
      return
    }
    const body = await this.fetchBody(url as string)
    if (body === undefined) return
    const latest = pickRelease(body, isPrerelease(this.options.current))
    if (latest) this.update({ latest })
  }

  private async fetchBody(url: string): Promise<unknown> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(undefined)
      }, this.options.limitMs ?? UPDATE_LIMIT_MS)
    })
    const fetched = (async () => {
      const response = await this.options.fetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal })
      return response.ok ? await response.json() : undefined
    })()
    const body = await Promise.race([fetched, timeout]).catch(() => undefined)
    clearTimeout(timer)
    return body
  }

  private update(change: Partial<UpdateState>, tell = true): void {
    const before = JSON.stringify(this.status())
    this.state = { ...this.state, ...change }
    saveState(this.options.file, this.state)
    if (tell && JSON.stringify(this.status()) !== before) this.options.onChange?.(this.status())
  }
}
