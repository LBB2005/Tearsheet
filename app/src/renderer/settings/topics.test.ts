import { describe, expect, it } from 'vitest'

import type { ToolStatus } from '../../preload/api'
import type { LockdownState } from '../../shared/protocol'
import { healthTiles, type HealthInput } from './settings'
import { moveTopic, needsYou, problems, shortVersion, toolRole, topicName, TOPICS } from './topics'

const MB = 1024 ** 2
const GB = 1024 ** 3

const tool = (kind: 'claude' | 'codex', over: Partial<ToolStatus> = {}): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path: `/usr/local/bin/${kind}`,
  available: true,
  version: kind === 'claude' ? '2.1.317 (Claude Code)' : 'codex-cli 0.165.0',
  loggedIn: true,
  reason: null,
  ...over
})
const passed: LockdownState = { version: '2.1.317 (Claude Code)', passed: true, form: 'full', checked_at: '2026-11-04T22:52:56+00:00', blocked_reason: null }

const base: HealthInput = {
  tools: [tool('claude'), tool('codex')],
  primary: 'claude',
  lockdown: { claude: passed, codex: { ...passed, version: 'codex-cli 0.165.0' } },
  safety: null,
  keys: { massive: 'set', fred: 'set', alphavantage: 'missing' },
  rejected: [],
  rawBytes: 15 * MB,
  rawCap: 5
}
const health = (over: Partial<HealthInput>): HealthInput => ({ ...base, ...over })

describe('the topic list', () => {
  it('lists six topics in order, General first', () => {
    expect(TOPICS.map((t) => t.name)).toEqual(['General', 'AI tools', 'Data keys', 'Storage and backup', 'Privacy', 'Advanced'])
  })

  it('names each topic for the toolbar', () => {
    expect(topicName('keys')).toBe('Data keys')
    expect(topicName('storage')).toBe('Storage and backup')
  })
})

describe('moveTopic', () => {
  it('steps down and up one topic with the arrow keys', () => {
    expect(moveTopic('general', 'ArrowDown')).toBe('ai')
    expect(moveTopic('keys', 'ArrowUp')).toBe('ai')
  })

  it('stops at the ends instead of wrapping', () => {
    expect(moveTopic('general', 'ArrowUp')).toBe('general')
    expect(moveTopic('advanced', 'ArrowDown')).toBe('advanced')
  })

  it('jumps to the first and last topic with Home and End', () => {
    expect(moveTopic('keys', 'Home')).toBe('general')
    expect(moveTopic('keys', 'End')).toBe('advanced')
  })

  it('ignores every other key, so typing and Tab still work', () => {
    expect(moveTopic('keys', 'Tab')).toBeNull()
    expect(moveTopic('keys', 'a')).toBeNull()
    expect(moveTopic('keys', 'Enter')).toBeNull()
  })
})

describe('problems', () => {
  it('finds nothing when everything is ready, so no topic has a dot', () => {
    expect(problems(base)).toEqual([])
    expect(needsYou(problems(base)).size).toBe(0)
  })

  it('sends a missing FRED key to Data keys, in amber: reports still run without it', () => {
    const found = problems(health({ keys: { massive: 'set', fred: 'missing' } }))
    expect(found).toEqual([{ topic: 'keys', title: 'FRED key not added', detail: 'Reports leave out economic data until you add it.', action: 'Add key', tone: 'hold' }])
    expect([...needsYou(found)]).toEqual([['keys', 'hold']])
  })

  it('says a refused Massive key needs replacing, in red: new reports can’t be rated', () => {
    const [p] = problems(health({ rejected: ['massive'] }))
    expect(p).toMatchObject({ topic: 'keys', title: 'Massive key not accepted', action: 'Replace key', tone: 'bad' })
  })

  it('says a key macOS kept locked needs Always Allow, not adding', () => {
    expect(problems(health({ keys: { massive: 'locked', fred: 'set' } }))).toEqual([
      { topic: 'keys', title: 'Massive key locked in the Keychain', detail: 'macOS didn’t let Tearsheet open it. Quit Tearsheet, open it again, and click Always Allow when macOS asks.', action: 'Open data keys', tone: 'bad' }
    ])
  })

  it('leaves Alpha Vantage out: it isn’t used yet', () => {
    expect(problems(health({ keys: { massive: 'set', fred: 'set', alphavantage: 'missing' } }))).toEqual([])
  })

  it('sends a signed-out main tool to AI tools, in the health tile’s words', () => {
    const [p] = problems(health({ tools: [tool('claude', { loggedIn: false }), tool('codex')] }))
    expect(p).toMatchObject({ topic: 'ai', title: 'Claude Code signed out', action: 'Open AI tools' })
  })

  it('ignores a missing other tool: the drafts are then checked by the main one', () => {
    expect(problems(health({ tools: [tool('claude'), tool('codex', { available: false, reason: 'Not installed' })] }))).toEqual([])
  })

  it('warns when downloads are near or over the storage limit', () => {
    expect(problems(health({ rawBytes: 4.6 * GB }))[0]).toMatchObject({ topic: 'storage', title: 'Downloads are near the storage limit', detail: '4.6 GB of 5 GB used.' })
    expect(problems(health({ rawBytes: 6 * GB }))[0]).toMatchObject({ title: 'Downloads are over the storage limit' })
  })

  it('puts the AI tool first, then keys, then storage, and dots each topic once in its worst tone', () => {
    const found = problems(health({ tools: [tool('claude', { available: false, reason: 'Not found' })], keys: { massive: 'missing', fred: 'missing' }, rawBytes: 6 * GB }))
    expect(found.map((p) => p.topic)).toEqual(['ai', 'keys', 'keys', 'storage'])
    expect([...needsYou(found)]).toEqual([
      ['ai', 'bad'],
      ['keys', 'bad'],
      ['storage', 'hold']
    ])
  })
})

describe('toolRole', () => {
  const skeptic = (h: HealthInput) => healthTiles(h)[3]

  it('says the main tool writes the reports, with its short version', () => {
    expect(toolRole(tool('claude'), 'claude', skeptic(base))).toBe('Writes your reports · version 2.1.317')
  })

  it('says the other tool checks each draft while the skeptic is on', () => {
    expect(toolRole(tool('codex'), 'claude', skeptic(base))).toBe('Checks each draft · version 0.165.0')
  })

  it('says the other tool isn’t checking drafts while it is signed out', () => {
    const h = health({ tools: [tool('claude'), tool('codex', { loggedIn: false })] })
    expect(toolRole(tool('codex', { loggedIn: false }), 'claude', skeptic(h))).toBe('Not checking drafts · version 0.165.0')
  })

  it('gives the probe’s reason for a tool that isn’t found', () => {
    expect(toolRole(tool('codex', { available: false, reason: 'Not on this Mac yet' }), 'claude', skeptic(base))).toBe('Not on this Mac yet')
  })
})

describe('shortVersion', () => {
  it('keeps the version number and drops the rest', () => {
    expect(shortVersion('2.1.317 (Claude Code)')).toBe('2.1.317')
    expect(shortVersion('codex-cli 0.165.0')).toBe('0.165.0')
    expect(shortVersion('dev build')).toBe('dev build')
  })
})
