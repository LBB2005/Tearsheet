import { describe, expect, it } from 'vitest'

import type { ToolStatus } from '../../preload/api'
import type { LockdownState } from '../../shared/protocol'
import { safetyStarted, type SafetyState } from '../setup/state/safety'
import { tildePath, toolFlags } from '../../shared/tools'
import { fieldProblem, healthTiles, maskEmail, storage, toolPill, type HealthInput } from './settings'

const MB = 1024 ** 2
const GB = 1024 ** 3

// A tool in a state (ready unless said), with `available` and `loggedIn` worked out from it.
const tool = (kind: 'claude' | 'codex', over: Partial<ToolStatus> = {}): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path: `/usr/local/bin/${kind}`,
  version: kind === 'claude' ? '2.1.317 (Claude Code)' : 'codex-cli 0.165.0',
  reason: null,
  plan: null,
  email: null,
  state: over.state ?? 'ready',
  ...toolFlags(over.state ?? 'ready'),
  ...over
})
const passed: LockdownState = { version: '2.1.317 (Claude Code)', passed: true, form: 'full', checked_at: '2026-11-04T22:52:56+00:00', blocked_reason: null }
const failed: LockdownState = { version: 'codex-cli 0.165.0', passed: false, form: 'full', checked_at: '2026-11-06T01:10:14+00:00', blocked_reason: 'lockdown_failed' }
const done = (tool: 'claude' | 'codex', ok: boolean): SafetyState => ({ tool, n: ok ? 25 : 9, total: 25, done: true, passed: ok, stopped: false, reason: ok ? null : 'It ran a command.', stopping: false, startedAt: null })

const base: HealthInput = {
  tools: [tool('claude'), tool('codex')],
  primary: 'claude',
  lockdown: { claude: passed, codex: { ...passed, version: 'codex-cli 0.165.0' } },
  safety: null,
  keys: { massive: 'set', fred: 'set', alphavantage: 'missing' },
  rawBytes: 15 * MB,
  rawCap: 5
}
const tiles = (over: Partial<HealthInput>) => healthTiles({ ...base, ...over })

describe('storage', () => {
  it('reads the stored size against the cap, as the prototype shows it', () => {
    expect(storage(15 * MB, 5)).toEqual({ used: '15 MB', cap: '5 GB', share: '0.3% of the cap', width: '0.29%', tone: 'ok', over: false })
  })

  it('sizes the numbers to what is stored', () => {
    expect(storage(0, 5).used).toBe('0 MB')
    expect(storage(0, 5).share).toBe('0% of the cap')
    expect(storage(300 * 1024, 5).used).toBe('300 KB')
    expect(storage(200, 5).used).toBe('1 KB')
    expect(storage(4.24 * MB, 5).used).toBe('4.2 MB')
    expect(storage(4 * MB, 5).used).toBe('4 MB')
    expect(storage(1.25 * GB, 5).used).toBe('1.3 GB')
    expect(storage(2 * GB, 2.5)).toMatchObject({ used: '2 GB', cap: '2.5 GB', share: '80% of the cap', width: '80%' })
    expect(storage(100 * 1024, 5).share).toBe('under 0.1% of the cap')
  })

  it('warns from 90% of the cap, as the engine does, and the bar never runs past the end', () => {
    expect(storage(4.4 * GB, 5).tone).toBe('ok')
    expect(storage(4.5 * GB, 5).tone).toBe('hold')
    expect(storage(4.5 * GB, 5).over).toBe(false)
    expect(storage(6 * GB, 5)).toMatchObject({ share: '120% of the cap', width: '100%', tone: 'hold', over: true })
  })

  it('treats a cap that is not a positive number as no cap to measure against', () => {
    expect(storage(15 * MB, 0)).toMatchObject({ share: '', width: '0%', tone: 'ok', over: false })
  })
})

describe('healthTiles', () => {
  it('shows four tiles, all well', () => {
    expect(tiles({})).toEqual([
      { name: 'AI tool', tone: 'ok', text: 'Claude Code ready' },
      { name: 'Data keys', tone: 'ok', text: '2 of 2 set' },
      { name: 'Storage', tone: 'ok', text: '15 MB of 5 GB' },
      { name: 'Other-tool skeptic', tone: 'ok', text: 'On: Codex checks the drafts' }
    ])
  })

  it('the AI tool tile follows the main tool: not found, signed out, a failed check, a check running', () => {
    expect(tiles({ tools: [tool('claude', { state: 'missing', version: null }), tool('codex')] })[0]).toEqual({ name: 'AI tool', tone: 'bad', text: 'Claude Code not found' })
    expect(tiles({ tools: [tool('claude', { state: 'signed_out' }), tool('codex')] })[0]).toMatchObject({ tone: 'bad', text: 'Claude Code signed out' })
    expect(tiles({ lockdown: { claude: { ...failed, version: '2.1.317' } } })[0]).toMatchObject({ tone: 'bad', text: 'Safety check didn’t pass' })
    expect(tiles({ safety: done('claude', false) })[0]).toMatchObject({ tone: 'bad', text: 'Safety check didn’t pass' })
    expect(tiles({ safety: { ...safetyStarted('claude'), n: 7 } })[0]).toMatchObject({ tone: 'run', text: 'Safety check, 7 of 25' })
    // This session's check passing outranks a failure stored before it.
    expect(tiles({ lockdown: { claude: failed }, safety: done('claude', true) })[0]).toMatchObject({ tone: 'ok', text: 'Claude Code ready' })
    // Unknown sign-in is not signed out.
    expect(tiles({ tools: [tool('claude', { state: 'cant_tell' }), tool('codex')] })[0]).toMatchObject({ tone: 'ok' })
  })

  it('follows Codex when it is the main tool', () => {
    const t = tiles({ primary: 'codex' })
    expect(t[0]).toMatchObject({ tone: 'ok', text: 'Codex ready' })
    expect(t[3]).toMatchObject({ tone: 'ok', text: 'On: Claude Code checks the drafts' })
  })

  it('waits quietly while the tools are still being looked for', () => {
    const t = tiles({ tools: [] })
    expect(t[0]).toEqual({ name: 'AI tool', tone: 'off', text: 'Looking for Claude Code…' })
    expect(t[3]).toEqual({ name: 'Other-tool skeptic', tone: 'off', text: 'Looking for Codex…' })
  })

  it('says when a key stopped working: Massive in red, FRED as a warning', () => {
    expect(tiles({ rejected: ['massive'] })[1]).toEqual({ name: 'Data keys', tone: 'bad', text: 'Massive’s key isn’t accepted' })
    expect(tiles({ rejected: ['fred'] })[1]).toEqual({ name: 'Data keys', tone: 'hold', text: 'FRED’s key isn’t accepted' })
    expect(tiles({ rejected: ['massive', 'fred'] })[1]).toEqual({ name: 'Data keys', tone: 'bad', text: 'Massive’s and FRED’s keys aren’t accepted' })
  })

  it('says when macOS kept a key locked, rather than calling it missing', () => {
    expect(tiles({ keys: { massive: 'locked', fred: 'set', alphavantage: 'missing' } })[1]).toEqual({ name: 'Data keys', tone: 'bad', text: 'Massive’s key is locked in the Keychain' })
    expect(tiles({ keys: { massive: 'set', fred: 'locked', alphavantage: 'missing' } })[1]).toEqual({ name: 'Data keys', tone: 'hold', text: 'FRED’s key is locked in the Keychain' })
    expect(tiles({ keys: { massive: 'locked', fred: 'locked', alphavantage: 'missing' } })[1]).toEqual({ name: 'Data keys', tone: 'bad', text: 'Massive’s and FRED’s keys are locked in the Keychain' })
  })

  it('counts the two keys reports use; Alpha Vantage is not used yet', () => {
    expect(tiles({ keys: { massive: 'set', fred: 'missing', alphavantage: 'set' } })[1]).toEqual({ name: 'Data keys', tone: 'hold', text: '1 of 2 set, FRED missing' })
    expect(tiles({ keys: { massive: 'missing', fred: 'set', alphavantage: 'set' } })[1]).toMatchObject({ tone: 'bad', text: '1 of 2 set, Massive missing' })
    expect(tiles({ keys: { massive: 'missing', fred: 'missing', alphavantage: 'missing' } })[1]).toMatchObject({ tone: 'bad', text: '0 of 2 set, Massive and FRED missing' })
  })

  it('the storage tile warns near the cap', () => {
    expect(tiles({ rawBytes: 4.6 * GB })[2]).toEqual({ name: 'Storage', tone: 'hold', text: '4.6 GB of 5 GB' })
  })

  it('the skeptic is off when the other tool is missing, failed its check or signed out', () => {
    expect(tiles({ tools: [tool('claude'), tool('codex', { state: 'missing', version: null })] })[3]).toEqual({ name: 'Other-tool skeptic', tone: 'off', text: 'Off: Codex isn’t installed' })
    expect(tiles({ lockdown: { claude: passed, codex: failed } })[3]).toMatchObject({ tone: 'bad', text: 'Off: Codex failed its check' })
    expect(tiles({ safety: done('codex', false) })[3]).toMatchObject({ tone: 'bad', text: 'Off: Codex failed its check' })
    expect(tiles({ tools: [tool('claude'), tool('codex', { state: 'signed_out' })] })[3]).toMatchObject({ tone: 'hold', text: 'Off: Codex is signed out' })
    expect(tiles({ safety: { ...safetyStarted('codex'), n: 3 } })[3]).toMatchObject({ tone: 'run', text: 'Checking Codex, 3 of 25' })
    // A check running for the other tool doesn't touch the main tool's tile.
    expect(tiles({ safety: { ...safetyStarted('codex'), n: 3 } })[0]).toMatchObject({ tone: 'ok', text: 'Claude Code ready' })
  })

  it('Codex checks the drafts only when it is ready, as the engine says, unless it is billed to an API key', () => {
    for (const state of ['api_key', 'cant_tell'] as const) {
      expect(tiles({ tools: [tool('claude'), tool('codex', { state })] })[3]).toEqual({ name: 'Other-tool skeptic', tone: 'hold', text: 'Off: Codex isn’t signed in with ChatGPT' })
    }
    expect(tiles({ tools: [tool('claude'), tool('codex', { state: 'api_key' })], codexApi: true })[3]).toMatchObject({ tone: 'ok', text: 'On: Codex checks the drafts' })
    // Claude Code as the checking tool keeps its own rule.
    expect(tiles({ primary: 'codex', tools: [tool('claude', { state: 'cant_tell' }), tool('codex')] })[3]).toMatchObject({ tone: 'ok', text: 'On: Claude Code checks the drafts' })
  })
})

describe('a safety check that stopped part way', () => {
  const stopped = (kind: 'claude' | 'codex'): SafetyState => ({ ...safetyStarted(kind), n: 9, done: true, passed: false, stopped: true, reason: 'The check couldn’t finish: usage limit' })

  it('is not shown as failed: the tile and the pill go by the last stored check', () => {
    expect(tiles({ safety: stopped('claude') })[0]).toMatchObject({ tone: 'off', text: 'Safety check didn’t finish' })
    expect(tiles({ safety: stopped('codex') })[3]).toMatchObject({ tone: 'ok', text: 'On: Codex checks the drafts' })
    expect(toolPill(tool('claude'), undefined, stopped('claude'))).toEqual({ tone: 'ok', text: 'Ready' })
  })
})

describe('toolPill', () => {
  it('says what state each tool is in', () => {
    expect(toolPill(tool('claude'), passed, null)).toEqual({ tone: 'ok', text: 'Ready' })
    expect(toolPill(tool('claude'), undefined, null)).toEqual({ tone: 'ok', text: 'Ready' })
    expect(toolPill(tool('codex', { state: 'missing' }), undefined, null)).toEqual({ tone: 'off', text: 'Not found' })
    expect(toolPill(tool('claude', { state: 'signed_out' }), passed, null)).toEqual({ tone: 'bad', text: 'Signed out' })
    expect(toolPill(tool('codex'), failed, null)).toEqual({ tone: 'bad', text: 'Not usable' })
    // A full check that didn't pass is not usable, as its lock-down line says.
    expect(toolPill(tool('claude'), { ...passed, passed: false }, null)).toEqual({ tone: 'bad', text: 'Not usable' })
    expect(toolPill(tool('claude'), passed, { ...safetyStarted('claude'), n: 4 })).toEqual({ tone: 'run', text: 'Checking' })
    expect(toolPill(tool('claude'), passed, done('claude', false))).toEqual({ tone: 'bad', text: 'Not usable' })
    expect(toolPill(tool('codex'), failed, done('codex', true))).toEqual({ tone: 'ok', text: 'Ready' })
    // Another tool's check says nothing about this one.
    expect(toolPill(tool('codex'), failed, done('claude', true))).toEqual({ tone: 'bad', text: 'Not usable' })
  })

  it('goes by what the status read found, so it agrees with the row’s button', () => {
    expect(toolPill(tool('claude', { state: 'too_old' }), passed, null)).toEqual({ tone: 'bad', text: 'Too old' })
    expect(toolPill(tool('codex', { state: 'api_key' }), undefined, null)).toEqual({ tone: 'bad', text: 'Not on a plan' })
    expect(toolPill(tool('claude', { state: 'free_plan' }), passed, null)).toEqual({ tone: 'bad', text: 'Free plan' })
    expect(toolPill(tool('claude', { state: 'cant_tell' }), passed, null)).toEqual({ tone: 'hold', text: 'Can’t tell' })
  })
})

describe('tildePath', () => {
  it('writes the home folder as ~', () => {
    expect(tildePath('/Users/liam/Tearsheet Backups')).toBe('~/Tearsheet Backups')
    expect(tildePath('/Users/liam')).toBe('~')
    expect(tildePath('/Volumes/Backup/Tearsheet')).toBe('/Volumes/Backup/Tearsheet')
    expect(tildePath('/Users/liamb-old/x').startsWith('~/')).toBe(true)
  })
})

describe('maskEmail', () => {
  it('shows the first letter and the domain, as the prototype does', () => {
    expect(maskEmail('someone@example.com')).toBe('s••••••••@example.com')
    expect(maskEmail('a@b.co')).toBe('a••••••••@b.co')
    expect(maskEmail(' x ')).toBe('x••••••••')
  })
})

describe('fieldProblem', () => {
  it('checks each general setting before it is saved', () => {
    expect(fieldProblem('sec_contact_email', 'liam@example.com')).toBeNull()
    expect(fieldProblem('sec_contact_email', 'liam')).toBe('That doesn’t look like an email address.')
    expect(fieldProblem('backup_dir', '~/Tearsheet Backups')).toBeNull()
    expect(fieldProblem('backup_dir', '   ')).toBe('Give the folder’s path, like ~/Tearsheet Backups.')
    expect(fieldProblem('goal1_round', '2')).toBeNull()
    expect(fieldProblem('goal1_round', '0')).toBe('Give a whole number, 1 or more.')
    expect(fieldProblem('goal1_round', '1.5')).toBe('Give a whole number, 1 or more.')
    expect(fieldProblem('raw_cap', '2.5')).toBeNull()
    expect(fieldProblem('raw_cap', '0')).toBe('Give a size in GB, more than 0.')
    expect(fieldProblem('raw_cap', 'lots')).toBe('Give a size in GB, more than 0.')
  })
})
