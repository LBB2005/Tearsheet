// How the app finds Claude Code and Codex (probe.ts), against real programs: small shell scripts
// in a temporary folder stand in for `claude` and `codex` and answer like each real one does when
// it is signed in, signed out, too old to say, or broken. Each stand-in writes the arguments it
// was given to a log, so the tests also pin that the probe only ever asks for the version and the
// sign-in status (never anything that reads the tool's own files).

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findOnPath, getTools, readLoggedIn } from './probe'

let dir: string
let bin: string
const saved = { claude: process.env.TEARSHEET_CLAUDE_BIN, codex: process.env.TEARSHEET_CODEX_BIN }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-probe-test-'))
  bin = join(dir, 'bin')
  mkdirSync(bin)
  delete process.env.TEARSHEET_CLAUDE_BIN
  delete process.env.TEARSHEET_CODEX_BIN
})
afterEach(() => {
  for (const [kind, value] of Object.entries(saved)) {
    const name = kind === 'claude' ? 'TEARSHEET_CLAUDE_BIN' : 'TEARSHEET_CODEX_BIN'
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  rmSync(dir, { recursive: true, force: true })
})

// A stand-in program: `version` is what --version prints (null: it fails), and `status` is what
// the sign-in status command prints and its exit code.
function standIn(name: string, opts: { version: string | null; status: string; statusCode?: number; folder?: string }): string {
  const folder = opts.folder ?? bin
  const path = join(folder, name)
  const log = join(dir, `${name}.log`)
  const version = opts.version === null ? 'echo "it broke" >&2; exit 2' : `printf '%s\\n' '${opts.version}'; exit 0`
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${log}'`,
      'if [ "$1" = "--version" ]; then',
      `  ${version}`,
      'fi',
      `printf '%s\\n' '${opts.status}'`,
      `exit ${opts.statusCode ?? 0}`
    ].join('\n')
  )
  chmodSync(path, 0o755)
  return path
}

const calls = (name: string) =>
  readFileSync(join(dir, `${name}.log`), 'utf8')
    .split('\n')
    .filter(Boolean)

const claudeIn = '{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "max"}'
const claudeOut = '{"loggedIn": false, "authMethod": "none"}'
const find = (tools: Awaited<ReturnType<typeof getTools>>, kind: string) => tools.find((t) => t.kind === kind)!

describe('a new person with neither tool', () => {
  it('finds neither, and says each wasn’t found on the PATH', async () => {
    const tools = await getTools(bin, true)
    expect(tools.map((t) => t.kind)).toEqual(['claude', 'codex'])
    expect(find(tools, 'claude')).toEqual({ kind: 'claude', name: 'Claude Code', path: null, available: false, version: null, loggedIn: null, reason: "claude wasn't found on your PATH." })
    expect(find(tools, 'codex')).toMatchObject({ available: false, loggedIn: null, reason: "codex wasn't found on your PATH." })
  })
})

describe('Claude Code', () => {
  it('found and signed in: its version, its path and signed in', async () => {
    const path = standIn('claude', { version: '2.1.317 (Claude Code)', status: claudeIn })
    const claude = find(await getTools(bin, true), 'claude')
    expect(claude).toEqual({ kind: 'claude', name: 'Claude Code', path, available: true, version: '2.1.317 (Claude Code)', loggedIn: true, reason: null })
  })

  it('found but signed out: the status is read even though the command exits with an error', async () => {
    standIn('claude', { version: '2.1.317 (Claude Code)', status: claudeOut, statusCode: 1 })
    expect(find(await getTools(bin, true), 'claude')).toMatchObject({ available: true, loggedIn: false })
  })

  it('a warning line printed before the status still leaves it readable', async () => {
    standIn('claude', { version: '2.1.317 (Claude Code)', status: `Update available! ${claudeIn}` })
    expect(find(await getTools(bin, true), 'claude').loggedIn).toBe(true)
  })

  it('too old to have `claude auth` (before 2.1.41): installed, but whether it is signed in is unknown', async () => {
    standIn('claude', { version: '2.0.14 (Claude Code)', status: "error: unknown command 'auth'", statusCode: 1 })
    expect(find(await getTools(bin, true), 'claude')).toMatchObject({ available: true, version: '2.0.14 (Claude Code)', loggedIn: null })
  })

  it('a program whose --version fails counts as not found', async () => {
    standIn('claude', { version: null, status: claudeIn })
    expect(find(await getTools(bin, true), 'claude')).toMatchObject({ available: false, version: null, loggedIn: null, reason: "claude --version didn't answer." })
  })

  it('is asked only for its version and its sign-in status', async () => {
    standIn('claude', { version: '2.1.317 (Claude Code)', status: claudeIn })
    await getTools(bin, true)
    expect(calls('claude')).toEqual(['--version', 'auth status --json'])
  })
})

describe('Codex', () => {
  it('found and signed in to ChatGPT', async () => {
    const path = standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT' })
    expect(find(await getTools(bin, true), 'codex')).toEqual({ kind: 'codex', name: 'Codex', path, available: true, version: 'codex-cli 0.165.0', loggedIn: true, reason: null })
  })

  it('found but signed out', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Not logged in', statusCode: 1 })
    expect(find(await getTools(bin, true), 'codex')).toMatchObject({ available: true, loggedIn: false })
  })

  it('a status it can’t read is unknown, not signed in', async () => {
    standIn('codex', { version: 'codex-cli 0.1.0', status: "error: unrecognized subcommand 'status'", statusCode: 2 })
    expect(find(await getTools(bin, true), 'codex').loggedIn).toBeNull()
  })

  it('is asked only for its version and its sign-in status', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT' })
    await getTools(bin, true)
    expect(calls('codex')).toEqual(['--version', 'login status'])
  })
})

describe('where the tools are looked for', () => {
  it('only Codex on the Mac: Codex is found and Claude Code is not', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT' })
    const tools = await getTools(bin, true)
    expect(find(tools, 'claude').available).toBe(false)
    expect(find(tools, 'codex')).toMatchObject({ available: true, loggedIn: true })
  })

  it('walks the PATH in order and takes the first folder that has it', async () => {
    const later = join(dir, 'later')
    mkdirSync(later)
    standIn('claude', { version: '2.1.317 (Claude Code)', status: claudeIn, folder: later })
    const first = standIn('claude', { version: '2.1.300 (Claude Code)', status: claudeIn })
    expect(findOnPath('claude', `${join(dir, 'empty')}:${bin}:${later}`)).toBe(first)
  })

  it('passes over a file that isn’t a program', () => {
    writeFileSync(join(bin, 'claude'), 'not a program')
    expect(findOnPath('claude', bin)).toBeNull()
  })

  it('a path named in TEARSHEET_CLAUDE_BIN wins over the PATH', async () => {
    const elsewhere = join(dir, 'elsewhere')
    mkdirSync(elsewhere)
    const chosen = standIn('claude', { version: '2.1.317 (Claude Code)', status: claudeIn, folder: elsewhere })
    standIn('claude', { version: '2.1.300 (Claude Code)', status: claudeIn })
    process.env.TEARSHEET_CLAUDE_BIN = chosen
    expect(find(await getTools(bin, true), 'claude')).toMatchObject({ path: chosen, version: '2.1.317 (Claude Code)' })
  })

  it('a TEARSHEET_CLAUDE_BIN that doesn’t exist yet counts as not found, at that path', async () => {
    const missing = join(dir, 'test-home', 'claude')
    process.env.TEARSHEET_CLAUDE_BIN = missing
    expect(find(await getTools(bin, true), 'claude')).toMatchObject({ path: missing, available: false, loggedIn: null })
  })
})

describe('the 30-second memory', () => {
  it('answers from memory within 30 seconds, and looks again when asked to', async () => {
    standIn('claude', { version: '2.1.317 (Claude Code)', status: claudeOut, statusCode: 1 })
    expect(find(await getTools(bin, true), 'claude').loggedIn).toBe(false)
    // The person signs in.
    standIn('claude', { version: '2.1.317 (Claude Code)', status: claudeIn })
    expect(find(await getTools(bin), 'claude').loggedIn).toBe(false)
    expect(calls('claude')).toHaveLength(2)
    expect(find(await getTools(bin, true), 'claude').loggedIn).toBe(true)
  })
})

describe('readLoggedIn', () => {
  it('reads Claude Code’s JSON, and its plain-text sign-out messages', () => {
    expect(readLoggedIn('claude', claudeIn)).toBe(true)
    expect(readLoggedIn('claude', claudeOut)).toBe(false)
    expect(readLoggedIn('claude', 'Not logged in. Please run /login')).toBe(false)
    expect(readLoggedIn('claude', '{"authMethod": "claude.ai"}')).toBeNull()
    expect(readLoggedIn('claude', '')).toBeNull()
  })

  it('reads Codex’s lines', () => {
    expect(readLoggedIn('codex', 'Logged in using ChatGPT')).toBe(true)
    expect(readLoggedIn('codex', 'Logged in using an API key - sk-…')).toBe(true)
    expect(readLoggedIn('codex', 'Not logged in')).toBe(false)
    expect(readLoggedIn('codex', 'something else')).toBeNull()
  })
})
