import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  checkDue,
  compareVersions,
  DAY_MS,
  FRESH_STATE,
  isNewer,
  isPrerelease,
  parseVersion,
  pickRelease,
  readState,
  RELEASES_API,
  releasesAddress,
  saveState,
  shownUpdate,
  UpdateCheck,
  type UpdateFetch,
  type UpdateRequest,
  type UpdateState
} from './updates'

const PAGE = (tag: string) => `https://github.com/LBB2005/Tearsheet/releases/tag/${tag}`
const release = (tag: string, extra: Record<string, unknown> = {}) => ({ tag_name: tag, html_url: PAGE(tag), prerelease: tag.includes('-'), draft: false, ...extra })

describe('versions', () => {
  test('a version may have a leading v, a pre-release and build metadata', () => {
    expect(parseVersion('v0.1.0-beta')).toEqual({ major: 0, minor: 1, patch: 0, pre: ['beta'] })
    expect(parseVersion('1.2.3-beta.2+build.7')).toEqual({ major: 1, minor: 2, patch: 3, pre: ['beta', '2'] })
    expect(parseVersion(' 2.0.0 ')).toEqual({ major: 2, minor: 0, patch: 0, pre: [] })
  })

  test('anything else is not a version', () => {
    for (const bad of ['', '1.2', '01.2.3', '1.2.3-', '1.2.3-beta..1', 'latest', 'v', '1.2.3.4']) expect(parseVersion(bad)).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
    expect(parseVersion(12)).toBeNull()
  })

  test('semver order, pre-releases included', () => {
    const order = ['0.1.0-alpha', '0.1.0-alpha.1', '0.1.0-alpha.beta', '0.1.0-beta', '0.1.0-beta.2', '0.1.0-beta.11', '0.1.0-rc.1', '0.1.0', '0.1.1', '0.2.0', '1.0.0-beta', '1.0.0', '10.0.0']
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) expect(compareVersions(order[i], order[j])).toBe(Math.sign(i - j))
    }
  })

  test('a v, and build metadata, don’t change the order', () => {
    expect(compareVersions('v0.1.0-beta', '0.1.0-beta')).toBe(0)
    expect(compareVersions('1.0.0+a', '1.0.0+b')).toBe(0)
  })

  test('comparing with something that isn’t a version gives no answer, and is never newer', () => {
    expect(compareVersions('1.0.0', 'nope')).toBeNull()
    expect(isNewer('nope', '0.1.0')).toBe(false)
    expect(isNewer('0.1.0', '0.1.0-beta')).toBe(true)
    expect(isNewer('0.1.0-beta', '0.1.0-beta')).toBe(false)
  })

  test('a pre-release has a part after the dash', () => {
    expect(isPrerelease('0.1.0-beta')).toBe(true)
    expect(isPrerelease('0.1.0')).toBe(false)
    expect(isPrerelease('junk')).toBe(false)
  })
})

describe('GitHub’s answer', () => {
  test('/releases/latest is one release', () => {
    expect(pickRelease(release('v0.2.0'), false)).toEqual({ version: '0.2.0', url: PAGE('v0.2.0'), prerelease: false })
  })

  test('from a list, the newest; drafts and tags that aren’t versions are skipped', () => {
    const list = [release('v0.1.0-beta'), release('v0.3.0', { draft: true }), release('nightly'), release('v0.2.0-beta.1'), release('v0.1.0')]
    expect(pickRelease(list, true)?.version).toBe('0.2.0-beta.1')
    expect(pickRelease(list, false)?.version).toBe('0.1.0')
  })

  test('a release marked pre-release on GitHub counts as one even without a dash', () => {
    expect(pickRelease([release('v0.2.0', { prerelease: true })], false)).toBeNull()
    expect(pickRelease([release('v0.2.0', { prerelease: true })], true)?.prerelease).toBe(true)
  })

  test('only a page on the repository’s own Releases is kept', () => {
    expect(pickRelease({ ...release('v0.2.0'), html_url: 'https://evil.example/releases/tag/v0.2.0' }, false)).toBeNull()
    expect(pickRelease({ ...release('v0.2.0'), html_url: 'https://github.com/someone/else/releases/tag/v0.2.0' }, false)).toBeNull()
    expect(pickRelease({ ...release('v0.2.0'), html_url: 42 }, false)).toBeNull()
  })

  test('an odd answer gives nothing', () => {
    for (const odd of [null, 'text', 42, {}, [], [null, 'x'], { message: 'Not Found' }]) expect(pickRelease(odd, true)).toBeNull()
  })

  test('a release asks for the latest release, a pre-release for the list, a test copy only its own address', () => {
    expect(releasesAddress('1.0.0', false, {})).toBe(`${RELEASES_API}/latest`)
    expect(releasesAddress('0.1.0-beta', false, {})).toBe(`${RELEASES_API}?per_page=20`)
    expect(releasesAddress('0.1.0-beta', true, {})).toBeNull()
    expect(releasesAddress('0.1.0-beta', true, { TEARSHEET_RELEASES_URL: ' http://127.0.0.1:9/r ' })).toBe('http://127.0.0.1:9/r')
  })
})

describe('what is kept', () => {
  let dir: string | null = null
  const file = () => {
    dir ??= mkdtempSync(join(tmpdir(), 'ts-updates-'))
    return join(dir, 'app-shell', 'updates.json')
  }
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  test('nothing saved, or a broken file, is the fresh state: checking on', () => {
    expect(readState(file())).toEqual(FRESH_STATE)
    saveState(file(), FRESH_STATE)
    writeFileSync(file(), '{not json')
    expect(readState(file())).toEqual(FRESH_STATE)
    writeFileSync(file(), '[]')
    expect(readState(file()).check).toBe(true)
    writeFileSync(file(), 'null')
    expect(readState(file())).toEqual(FRESH_STATE)
  })

  test('the state survives a save, and a stored release with a foreign page is dropped', () => {
    const state: UpdateState = { check: false, lastChecked: '2026-11-11T10:00:00.000Z', latest: { version: '0.2.0', url: PAGE('v0.2.0'), prerelease: false }, dismissed: '0.2.0' }
    expect(saveState(file(), state)).toBe(true)
    expect(readState(file())).toEqual(state)
    writeFileSync(file(), JSON.stringify({ ...state, latest: { version: '9.0.0', url: 'https://evil.example/' } }))
    expect(readState(file()).latest).toBeNull()
  })

  test('a save that can’t be written says so', () => {
    expect(saveState('/dev/null/updates.json', FRESH_STATE)).toBe(false)
  })

  test('due when never asked, a day after the last time, or when the clock went back; never when off', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    const at = (ms: number) => ({ ...FRESH_STATE, lastChecked: new Date(now.getTime() - ms).toISOString() })
    expect(checkDue(FRESH_STATE, now)).toBe(true)
    expect(checkDue(at(DAY_MS - 1), now)).toBe(false)
    expect(checkDue(at(DAY_MS), now)).toBe(true)
    expect(checkDue(at(-60_000), now)).toBe(true)
    expect(checkDue({ ...FRESH_STATE, lastChecked: 'garbage' }, now)).toBe(true)
    expect(checkDue({ ...FRESH_STATE, check: false }, now)).toBe(false)
  })
})

describe('the banner and Dismiss', () => {
  const latest = { version: '0.2.0', url: PAGE('v0.2.0'), prerelease: false }
  const state = (change: Partial<UpdateState> = {}): UpdateState => ({ ...FRESH_STATE, latest, ...change })

  test('shown when the newest release is newer than this copy', () => {
    expect(shownUpdate(state(), '0.1.0-beta')).toEqual(latest)
    expect(shownUpdate(state(), '0.2.0')).toBeNull()
    expect(shownUpdate(state(), '0.3.0')).toBeNull()
    expect(shownUpdate(state({ latest: null }), '0.1.0')).toBeNull()
  })

  test('dismissed hides that version only; a newer one shows again', () => {
    expect(shownUpdate(state({ dismissed: '0.2.0' }), '0.1.0')).toBeNull()
    expect(shownUpdate(state({ dismissed: '0.1.5' }), '0.1.0')).toEqual(latest)
    expect(shownUpdate(state({ dismissed: '0.2.0', latest: { ...latest, version: '0.2.1' } }), '0.1.0')?.version).toBe('0.2.1')
  })

  test('off never shows it', () => {
    expect(shownUpdate(state({ check: false }), '0.1.0')).toBeNull()
  })
})

describe('the check', () => {
  let dir: string
  const NOW = new Date('2026-11-11T12:00:00Z')
  const setup = (options: { current?: string; url?: string | null; fetch?: UpdateFetch; saved?: Partial<UpdateState>; instead?: () => Promise<unknown>; limitMs?: number } = {}) => {
    dir = mkdtempSync(join(tmpdir(), 'ts-updates-'))
    const file = join(dir, 'updates.json')
    if (options.saved) saveState(file, { ...FRESH_STATE, ...options.saved })
    const onChange = vi.fn()
    const fetch = vi.fn(options.fetch ?? (async () => ({ ok: true, json: async () => [release('v0.1.0-beta'), release('v0.2.0')] })))
    const check = new UpdateCheck({ file, current: options.current ?? '0.1.0-beta', url: options.url === undefined ? 'https://api.example/releases' : options.url, fetch, onChange, now: () => NOW, instead: options.instead, limitMs: options.limitMs })
    return { check, fetch, onChange, file }
  }
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('asks with one plain GET, and tells the window about the newer release', async () => {
    const { check, fetch, onChange, file } = setup()
    expect(check.status()).toEqual({ check: true, update: null })
    await check.run()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, UpdateRequest]
    expect(url).toBe('https://api.example/releases')
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store' })
    expect(Object.keys(init).sort()).toEqual(['cache', 'credentials', 'method', 'signal'])
    expect(check.status().update?.version).toBe('0.2.0')
    expect(check.shown()?.url).toBe(PAGE('v0.2.0'))
    expect(onChange).toHaveBeenLastCalledWith({ check: true, update: expect.objectContaining({ version: '0.2.0' }) })
    expect(JSON.parse(readFileSync(file, 'utf8')).lastChecked).toBe(NOW.toISOString())
  })

  test('at most once a day: a second launch the same day doesn’t ask, but still shows what it saw', async () => {
    const first = setup()
    await first.check.run()
    const again = new UpdateCheck({ file: first.file, current: '0.1.0-beta', url: 'https://api.example/releases', fetch: first.fetch, now: () => new Date(NOW.getTime() + DAY_MS - 1) })
    await again.run()
    expect(first.fetch).toHaveBeenCalledTimes(1)
    expect(again.status().update?.version).toBe('0.2.0')
  })

  test('two calls at once share one request', async () => {
    const { check, fetch } = setup()
    await Promise.all([check.run(), check.run()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('offline, an error page or odd JSON: silent, nothing shown, and it waits a day', async () => {
    for (const fail of [
      async () => {
        throw new Error('net::ERR_INTERNET_DISCONNECTED')
      },
      async () => ({ ok: false, status: 403, json: async () => ({ message: 'rate limited' }) }),
      async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('bad json')
        }
      }),
      async () => ({ ok: true, json: async () => ({ message: 'Not Found' }) })
    ] as UpdateFetch[]) {
      const { check, onChange, file } = setup({ fetch: fail })
      await expect(check.run()).resolves.toBeUndefined()
      expect(check.status()).toEqual({ check: true, update: null })
      expect(onChange).not.toHaveBeenCalled()
      expect(readState(file).lastChecked).toBe(NOW.toISOString())
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a request that hangs is given up after the limit', async () => {
    const { check } = setup({ fetch: (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))), limitMs: 20 })
    await check.run()
    expect(check.status().update).toBeNull()
  })

  test('a stable copy isn’t offered a pre-release', async () => {
    const { check } = setup({ current: '0.2.0', fetch: async () => ({ ok: true, json: async () => [release('v0.3.0-beta')] }) })
    await check.run()
    expect(check.status().update).toBeNull()
  })

  test('Dismiss hides that version, and only a version can be dismissed', async () => {
    const { check, onChange } = setup()
    await check.run()
    expect(check.dismiss(42).update?.version).toBe('0.2.0')
    expect(check.dismiss('v0.2.0')).toEqual({ check: true, update: null })
    expect(onChange).toHaveBeenLastCalledWith({ check: true, update: null })
    expect(check.shown()).toBeNull()
  })

  test('turned off: never asks, and hides the banner; turned back on, it asks if due', async () => {
    const off = setup({ saved: { check: false } })
    await off.check.run()
    expect(off.fetch).not.toHaveBeenCalled()
    expect(off.check.setCheck(true).check).toBe(true)
    await off.check.run()
    expect(off.fetch).toHaveBeenCalledTimes(1)
    expect(off.check.status().update?.version).toBe('0.2.0')
    expect(off.check.setCheck(false)).toEqual({ check: false, update: null })
  })

  test('no address (a test copy without one): never asks', async () => {
    const { check, fetch } = setup({ url: null })
    await check.run()
    expect(fetch).not.toHaveBeenCalled()
  })

  test('a signed build runs electron-updater on the same schedule instead, and shows no banner', async () => {
    const instead = vi.fn(async () => {
      throw new Error('offline')
    })
    const { check, fetch } = setup({ url: null, instead })
    await check.run()
    await check.run()
    expect(instead).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
    expect(check.status().update).toBeNull()
  })
})
