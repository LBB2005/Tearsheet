import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createSetupLog, redact, type SetupEvent, type SetupFields } from './setupLog'

let dir: string
let file: string
const HOME = '/Users/somebody'
const AT = new Date('2026-11-08T12:00:00.000Z')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-setuplog-test-'))
  file = join(dir, 'logs', 'setup.log')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const lines = () => readFileSync(file, 'utf8').split('\n').filter(Boolean)
const log = () => createSetupLog(file, { home: HOME, now: () => AT })

describe('what is written', () => {
  it('one timestamped line per event, with its fields', () => {
    log().log('status_read', { tool: 'claude', path: '/opt/homebrew/bin/claude', exit: 0, ms: 812, state: 'ready', plan: 'max' })
    log().log('test_rules', { test_mode: true, no_real_installers: true })
    expect(lines()).toEqual([
      '2026-11-08T12:00:00.000Z status_read tool=claude path=/opt/homebrew/bin/claude exit=0 ms=812 state=ready plan=max',
      '2026-11-08T12:00:00.000Z test_rules test_mode=true no_real_installers=true'
    ])
  })

  it('an unknown event is dropped, and so is an unknown field', () => {
    log().log('raw_output' as SetupEvent, { tool: 'claude' })
    log().log('copy_terminal', { copied: true, opened: false, command: 'curl …' } as SetupFields)
    expect(lines()).toEqual(['2026-11-08T12:00:00.000Z copy_terminal copied=true opened=false'])
  })

  it('leaves out empty fields, and quotes a value with a space', () => {
    log().log('status_read', { tool: 'codex', exit: null, signal: undefined, ms: Number.NaN, path: '/Applications/My Tools/codex' })
    expect(lines()).toEqual(['2026-11-08T12:00:00.000Z status_read tool=codex path="/Applications/My Tools/codex"'])
  })
})

describe('no personal data', () => {
  it('writes the home folder as ~', () => {
    expect(redact('/Users/somebody/.local/bin/claude', HOME)).toBe('~/.local/bin/claude')
    expect(redact('/Users/somebody', HOME)).toBe('~')
    expect(redact('Another copy at /Users/somebody/.npm-global/bin is found first', HOME)).toBe('Another copy at ~/.npm-global/bin is found first')
    // A folder that only starts with the same name is someone else's.
    expect(redact('/Users/somebody-else/bin', HOME)).toBe('/Users/somebody-else/bin')
  })

  it('removes emails and links', () => {
    expect(redact('signed in as you@example.com', HOME)).toBe('signed in as [removed]')
    expect(redact('open https://claude.ai/oauth/authorize?code=abc&state=x to sign in', HOME)).toBe('open [removed] to sign in')
  })

  it('removes anything long enough to be a key or an ID', () => {
    expect(redact('sk-proj-AbCdEfGhIjKlMnOpQrSt', HOME)).toBe('[removed]')
    expect(redact('key abcdefghijklmnopqrstuvwxyz012345', HOME)).toBe('key [removed]')
    expect(redact('org 00000000-0000-4000-8000-000000000001', HOME)).toBe('org [removed]')
    // Short codes stay readable.
    expect(redact('KEY_REJECTED', HOME)).toBe('KEY_REJECTED')
  })

  it('applies to every value written', () => {
    log().log('install_step', { tool: 'claude', reason_code: 'see https://example.com/x', path: '/Users/somebody/.local/bin/claude', value: 'you@example.com' })
    const [line] = lines()
    expect(line).toBe('2026-11-08T12:00:00.000Z install_step tool=claude reason_code="see [removed]" path=~/.local/bin/claude value=[removed]')
    expect(line).not.toContain('somebody')
  })
})

describe('a log that can’t be written', () => {
  it('never throws', () => {
    // The log file's place is taken by a folder.
    mkdirSync(file, { recursive: true })
    expect(() => log().log('test_rules', { test_mode: false })).not.toThrow()
  })
})
