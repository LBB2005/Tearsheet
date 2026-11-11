import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import type { ToolStatus } from '../shared/tools'
import { diagnosticsText, LOG_LINES, readLogTail, scrub, toolLine } from './diagnostics'

const HOME = '/Users/pat.smith'

test('emails are removed, whatever they look like', () => {
  expect(scrub('contact pat.smith+sec@example.co.uk sent', HOME)).toBe('contact [email] sent')
  expect(scrub('User-Agent: Tearsheet/0.1.0 someone@mail.example.com', HOME)).toBe('User-Agent: Tearsheet/0.1.0 [email]')
  expect(scrub('"sec_contact_email": "A.B@Example.ORG"', HOME)).toBe('"sec_contact_email": "[email]"')
})

test('the home folder and the account name in any /Users path are removed', () => {
  expect(scrub(`File "${HOME}/Library/Application Support/Tearsheet/raw/x.json"`, HOME)).toBe('File "~/Library/Application Support/Tearsheet/raw/x.json"')
  expect(scrub('/Users/someone-else/code/Tearsheet', HOME)).toBe('/Users/[name]/code/Tearsheet')
  expect(scrub(`cwd=${HOME}`, HOME)).toBe('cwd=~')
  // A home folder that is only a prefix of another name isn't half-replaced.
  expect(scrub('/Users/pat.smithson/file', HOME)).toBe('/Users/[name]/file')
})

test('keys and tokens are removed, by their name and by their shape', () => {
  const massive = 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE' // 32 letters and digits, like a Massive key
  const fred = '0123456789abcdef0123456789abcdef' // 32 hex characters, like a FRED key
  expect(scrub(`GET https://api.massive.com/v2/aggs?apiKey=${massive}&limit=5`, HOME)).toBe('GET https://api.massive.com/v2/aggs?apiKey=[secret]&limit=5')
  expect(scrub(`series?api_key=${fred}&file_type=json`, HOME)).toBe('series?api_key=[secret]&file_type=json')
  expect(scrub('Authorization: Bearer abc.def-ghi_123', HOME)).toBe('Authorization: Bearer [secret]')
  expect(scrub('ANTHROPIC_API_KEY=sk-ant-api03-AbCdEf_123-xyz', HOME)).toBe('ANTHROPIC_API_KEY=[secret]')
  expect(scrub('using sk-ant-oat01-AbCdEfGh_ij-KL and sk-proj-AbCdEf123456', HOME)).toBe('using [secret] and [secret]')
  expect(scrub('"token": "short-but-named", "password": "hunter2"', HOME)).toBe('"token": "[secret]", "password": "[secret]"')
  expect(scrub(`a bare ${massive} in a line`, HOME)).toBe('a bare [secret] in a line')
  expect(scrub(`and ${fred}.`, HOME)).toBe('and [secret].')
})

test('ordinary log lines keep their words, dates, run ids and short numbers', () => {
  const line = '2026-11-10 23:53:04,902 WARNING run-20261108T030652Z-eaba66 step 9 took 12.5 s (HTTP 429)'
  expect(scrub(line, HOME)).toBe(line)
  expect(scrub('Tearsheet 0.1.0-beta, engine 0.1.0b0, macOS 26.1', HOME)).toBe('Tearsheet 0.1.0-beta, engine 0.1.0b0, macOS 26.1')
})

const tool = (over: Partial<ToolStatus>): ToolStatus => ({
  kind: 'claude',
  name: 'Claude Code',
  path: `${HOME}/.local/bin/claude`,
  available: true,
  version: '2.1.320',
  loggedIn: true,
  reason: null,
  state: 'ready',
  plan: 'max',
  email: 'pat@example.com',
  ...over
})

test('each AI tool is its name, version and state, never its email, plan or path', () => {
  expect(toolLine(tool({}))).toBe('Claude Code 2.1.320 (ready)')
  expect(toolLine(tool({ kind: 'codex', name: 'Codex', version: null, available: false, state: 'missing' }))).toBe('Codex not found (missing)')
})

test('the copied text: versions, AI tools, then the log, all scrubbed', () => {
  const text = diagnosticsText({
    about: { app: '0.1.0-beta', engine: '0.1.0b0', macos: '26.1', electron: '33.2.1' },
    primaryTool: 'claude',
    tools: [tool({}), tool({ kind: 'codex', name: 'Codex', version: null, available: false, state: 'missing' })],
    log: `started in ${HOME}/Library\nsent to pat@example.com\n`,
    home: HOME
  })
  expect(text).toBe(
    [
      'Tearsheet diagnostics',
      'Tearsheet 0.1.0-beta',
      'Engine 0.1.0b0',
      'macOS 26.1',
      'Electron 33.2.1',
      'Reports use: claude',
      'Claude Code 2.1.320 (ready)',
      'Codex not found (missing)',
      '',
      `Last lines of engine.log (up to ${LOG_LINES}; emails, keys and your home folder removed):`,
      'started in ~/Library',
      'sent to [email]'
    ].join('\n')
  )
  expect(text).not.toContain('pat@example.com')
  expect(text).not.toContain(HOME)
})

test('with no engine, no tools read and no log yet, it still says so', () => {
  const text = diagnosticsText({ about: { app: '0.1.0-beta', engine: null, macos: '26.1', electron: '33.2.1' }, primaryTool: null, tools: null, log: null, home: HOME })
  expect(text).toContain('Engine not running')
  expect(text).toContain('AI tools: not read yet')
  expect(text).toContain('No engine.log yet.')
  expect(text).not.toContain('Reports use')
})

let dir = ''
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

test('reads only the last lines of the log, and null when there is none', () => {
  dir = mkdtempSync(join(tmpdir(), 'diag-'))
  const file = join(dir, 'engine.log')
  expect(readLogTail(file)).toBeNull()
  writeFileSync(file, Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n') + '\n')
  const tail = readLogTail(file)!.split('\n')
  expect(tail).toHaveLength(LOG_LINES)
  expect(tail[0]).toBe('line 301')
  expect(tail.at(-1)).toBe('line 500')
})

test('a huge log is read from its end only', () => {
  dir = mkdtempSync(join(tmpdir(), 'diag-'))
  const file = join(dir, 'engine.log')
  writeFileSync(file, 'x'.repeat(2_000_000) + '\nlast line\n')
  const tail = readLogTail(file)!
  expect(tail.endsWith('last line')).toBe(true)
  expect(tail.length).toBeLessThan(300_000)
})
