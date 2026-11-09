import { describe, expect, it } from 'vitest'

import { installDir, isEmail, MIN_CLAUDE_VERSION, pickTool, tildePath, toolFlags, versionBelow, versionNumber, type ToolState, type ToolStatus } from './tools'

const tool = (kind: 'claude' | 'codex', state: ToolState): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path: state === 'missing' ? null : `/Users/you/.local/bin/${kind}`,
  ...toolFlags(state),
  version: state === 'missing' ? null : '1.0.0',
  reason: null,
  state,
  plan: null,
  email: null
})

describe('the old fields, worked out from state', () => {
  it.each([
    ['missing', false, null],
    ['too_old', true, null],
    ['cant_tell', true, null],
    ['signed_out', true, false],
    ['api_key', true, true],
    ['free_plan', true, true],
    ['ready', true, true]
  ] as const)('%s: available %s, loggedIn %s', (state, available, loggedIn) => {
    expect(toolFlags(state)).toEqual({ available, loggedIn })
  })
})

describe('pickTool', () => {
  it('takes the first ready tool, Claude Code before Codex, whatever the order given', () => {
    expect(pickTool([tool('codex', 'ready'), tool('claude', 'ready')])?.kind).toBe('claude')
    expect(pickTool([tool('claude', 'signed_out'), tool('codex', 'ready')])?.kind).toBe('codex')
  })

  it('else the first tool that isn’t missing, in the same order', () => {
    expect(pickTool([tool('codex', 'signed_out'), tool('claude', 'too_old')])?.kind).toBe('claude')
    expect(pickTool([tool('claude', 'missing'), tool('codex', 'cant_tell')])?.kind).toBe('codex')
  })

  it('else none', () => {
    expect(pickTool([tool('claude', 'missing'), tool('codex', 'missing')])).toBeNull()
    expect(pickTool([])).toBeNull()
  })
})

describe('installDir', () => {
  it('is ~/.local/bin for both tools', () => {
    expect(installDir('claude', '/Users/you')).toBe('/Users/you/.local/bin')
    expect(installDir('codex', '/Users/you/')).toBe('/Users/you/.local/bin')
  })
})

describe('versionBelow', () => {
  it('compares the dotted numbers of a --version line', () => {
    expect(versionBelow('2.1.300 (Claude Code)', MIN_CLAUDE_VERSION)).toBe(true)
    expect(versionBelow('2.1.317 (Claude Code)', MIN_CLAUDE_VERSION)).toBe(false)
    expect(versionBelow('2.1.318 (Claude Code)', MIN_CLAUDE_VERSION)).toBe(false)
    expect(versionBelow('2.2.0', MIN_CLAUDE_VERSION)).toBe(false)
    expect(versionBelow('1.99.999', MIN_CLAUDE_VERSION)).toBe(true)
    expect(versionBelow('2.1', '2.1.0')).toBe(false)
    expect(versionBelow('10.0.0', '9.9.9')).toBe(false)
  })

  it('can’t say for a line with no version number', () => {
    expect(versionBelow('dev build', MIN_CLAUDE_VERSION)).toBeNull()
    expect(versionBelow(null, MIN_CLAUDE_VERSION)).toBeNull()
  })
})

describe('isEmail', () => {
  it('accepts an address', () => {
    expect(isEmail('you@example.com')).toBe(true)
    expect(isEmail('  you@example.com ')).toBe(true)
  })

  it('refuses what is not one', () => {
    expect(isEmail('you@')).toBe(false)
    expect(isEmail('you@example')).toBe(false)
    expect(isEmail('you example.com')).toBe(false)
    expect(isEmail('')).toBe(false)
  })
})

describe('versionNumber', () => {
  it('takes the number out of a --version line', () => {
    expect(versionNumber('2.1.317 (Claude Code)')).toBe('2.1.317')
    expect(versionNumber('codex-cli 0.165.0')).toBe('0.165.0')
  })

  it('keeps a line with no number, and passes null through', () => {
    expect(versionNumber('dev build')).toBe('dev build')
    expect(versionNumber(null)).toBeNull()
  })
})

describe('tildePath', () => {
  it('writes the home folder as ~', () => {
    expect(tildePath('/Users/you/Tearsheet Backups')).toBe('~/Tearsheet Backups')
    expect(tildePath('/Users/you')).toBe('~')
    expect(tildePath('/Volumes/Backup/Tearsheet')).toBe('/Volumes/Backup/Tearsheet')
    expect(tildePath('/Users/you-old/x').startsWith('~/')).toBe(true)
  })
})
