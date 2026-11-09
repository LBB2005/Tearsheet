import { describe, expect, it } from 'vitest'

import type { ToolStatus } from '../../preload/api'
import type { LockdownState } from '../../shared/protocol'
import { lockdownText } from './lockdown'

// The words come from views/Connections.tsx as it was before the restyle, pinned here so they
// can't drift.

const CLAUDE: ToolStatus = { kind: 'claude', name: 'Claude Code', path: '/usr/local/bin/claude', available: true, version: '2.1.317 (Claude Code)', loggedIn: true, reason: null, state: 'ready', plan: 'max', email: null }
const CODEX: ToolStatus = { kind: 'codex', name: 'Codex', path: '/usr/local/bin/codex', available: true, version: 'codex-cli 0.165.0', loggedIn: true, reason: null, state: 'ready', plan: null, email: null }

const state = (s: Partial<LockdownState>): LockdownState => ({ version: '2.1.317 (Claude Code)', passed: true, form: 'full', checked_at: '2026-11-04T22:52:56+00:00', blocked_reason: null, ...s })

describe('lockdownText', () => {
  it('a tool never checked is ready, and checked before its first use', () => {
    expect(lockdownText(CLAUDE, undefined)).toBe('Ready: checked automatically before its first use.')
  })

  it('a failed check makes the tool unusable, with the command to check it again', () => {
    expect(lockdownText(CODEX, state({ version: 'codex-cli 0.165.0', passed: false, blocked_reason: 'lockdown_failed' }))).toBe(
      'Not usable with Tearsheet: its lock-down check failed. Run: tearsheet-engine lockdown-check --tool codex'
    )
    // A full check that didn't pass reads the same, even with no blocked reason stored.
    expect(lockdownText(CLAUDE, state({ passed: false, form: 'full' }))).toBe(
      'Not usable with Tearsheet: its lock-down check failed. Run: tearsheet-engine lockdown-check --tool claude'
    )
  })

  it('an attempt to use a tool is checked again before the next AI step', () => {
    expect(lockdownText(CLAUDE, state({ passed: false, form: 'short', blocked_reason: 'tool_use_attempt' }))).toBe(
      'It tried to use a tool, so it is checked again before the next AI step.'
    )
  })

  it('a short check that did not pass is checked again before the next use', () => {
    expect(lockdownText(CLAUDE, state({ passed: false, form: 'short' }))).toBe('Checked again automatically before its next use.')
  })

  it('a check that passed for another version is checked again for this one', () => {
    expect(lockdownText({ ...CLAUDE, version: '2.1.400 (Claude Code)' }, state({ version: '2.1.317' }))).toBe(
      'Passed for 2.1.317; this version is checked again before the next AI step.'
    )
  })

  it('a check that passed says which form, and when', () => {
    const day = new Date('2026-11-04T22:52:56+00:00').toLocaleDateString()
    expect(lockdownText(CLAUDE, state({}))).toBe(`Passed (full check, ${day})`)
    expect(lockdownText(CLAUDE, state({ form: 'short', checked_at: null }))).toBe('Passed (short check)')
    // A stored version inside the found one's line is the same version.
    expect(lockdownText(CLAUDE, state({ version: '2.1.317' }))).toBe(`Passed (full check, ${day})`)
  })
})
