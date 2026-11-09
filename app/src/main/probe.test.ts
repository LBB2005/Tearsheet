// How the app finds Claude Code and Codex (probe.ts), against real programs: small shell scripts
// in a temporary folder stand in for `claude` and `codex` and answer like each real one does, on
// the stream each real one uses (Claude Code's JSON on standard output, Codex's messages on
// standard error). Each stand-in writes the arguments it was given to a log, so the tests also pin
// that the probe only ever asks for the version and the sign-in status (never anything that reads
// the tool's own files), and never runs the status of a Claude Code that is too old.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ToolStatus } from '../shared/tools'
import { findOnPath, Probe, readStatus, stripTerminalCodes, type ProbeOptions } from './probe'
import type { SetupEvent, SetupFields, SetupLog } from './setupLog'

let dir: string
let bin: string
let entries: [SetupEvent, SetupFields][]
const log: SetupLog = { log: (event, fields = {}) => void entries.push([event, fields]) }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-probe-test-'))
  bin = join(dir, 'bin')
  mkdirSync(bin)
  entries = []
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type Stream = 'stdout' | 'stderr'

// A stand-in program. `version` is what --version prints (null: it fails). `status` (or the file
// `statusFile`) is what the status command prints on `stream` (each tool's own by default), and
// `other` what it prints on the other stream. `sleep` makes the status take that many seconds.
// When the status command ends it leaves `<name>.ended`, so a test can see it ran to the end.
function standIn(
  name: 'claude' | 'codex',
  opts: { version: string | null; status?: string; statusFile?: string; stream?: Stream; other?: string; statusCode?: number; folder?: string; sleep?: number; helper?: boolean }
): string {
  const folder = opts.folder ?? bin
  const path = join(folder, name)
  const stream = opts.stream ?? (name === 'claude' ? 'stdout' : 'stderr')
  const fd = (s: Stream) => (s === 'stdout' ? '' : ' >&2')
  const statusFile = opts.statusFile ?? join(dir, `${name}.status`)
  if (opts.statusFile === undefined) writeFileSync(statusFile, `${opts.status ?? ''}\n`)
  const otherFile = join(dir, `${name}.other`)
  if (opts.other !== undefined) writeFileSync(otherFile, `${opts.other}\n`)
  const version = opts.version === null ? 'echo "it broke" >&2; exit 2' : `printf '%s\\n' '${opts.version}'; exit 0`
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${join(dir, `${name}.log`)}'`,
      `printf '%s|%s\\n' "$CLAUDE_CONFIG_DIR" "$CODEX_HOME" >> '${join(dir, `${name}.env`)}'`,
      'if [ "$1" = "--version" ]; then',
      `  ${version}`,
      'fi',
      opts.sleep ? `/bin/sleep ${opts.sleep}` : '',
      // A helper left running that keeps the output stream open after the program exits.
      opts.helper ? '/bin/sleep 4 &' : '',
      opts.other !== undefined ? `/bin/cat '${otherFile}'${fd(stream === 'stdout' ? 'stderr' : 'stdout')}` : '',
      `/bin/cat '${statusFile}'${fd(stream)}`,
      `/usr/bin/touch '${join(dir, `${name}.ended`)}'`,
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

const probe = (opts: Partial<ProbeOptions> = {}) => new Probe({ pathValue: bin, env: {}, log, ...opts })
const read = async (opts: Partial<ProbeOptions> = {}) => probe(opts).getTools()
const find = (tools: ToolStatus[], kind: string) => tools.find((t) => t.kind === kind)!
const fixture = (file: string) => join(__dirname, 'probe.fixtures', file)
const waitFor = async (check: () => boolean, ms = 5000) => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const claudeIn = '{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", "email": "you@example.com", "subscriptionType": "max"}'
const claudeOut = '{"loggedIn": false, "authMethod": "none", "apiProvider": "firstParty"}'
const NEW = '2.1.317 (Claude Code)'

describe('a new person with neither tool', () => {
  it('finds neither, and says each wasn’t found on the PATH', async () => {
    const tools = await read()
    expect(tools.map((t) => t.kind)).toEqual(['claude', 'codex'])
    expect(find(tools, 'claude')).toEqual({
      kind: 'claude',
      name: 'Claude Code',
      path: null,
      available: false,
      version: null,
      loggedIn: null,
      reason: "claude wasn't found on your PATH.",
      state: 'missing',
      plan: null,
      email: null
    })
    expect(find(tools, 'codex')).toMatchObject({ state: 'missing', available: false, loggedIn: null, reason: "codex wasn't found on your PATH." })
  })
})

describe('Claude Code', () => {
  it('found and signed in to a plan: ready, with its version, path, plan and email', async () => {
    const path = standIn('claude', { version: NEW, status: claudeIn })
    expect(find(await read(), 'claude')).toEqual({
      kind: 'claude',
      name: 'Claude Code',
      path,
      available: true,
      version: NEW,
      loggedIn: true,
      reason: null,
      state: 'ready',
      plan: 'max',
      email: 'you@example.com'
    })
  })

  it('found but signed out: the status is read even though the command exits with an error', async () => {
    standIn('claude', { version: NEW, status: claudeOut, statusCode: 1 })
    expect(find(await read(), 'claude')).toMatchObject({ state: 'signed_out', available: true, loggedIn: false, plan: null, email: null })
  })

  it('a warning line printed before the JSON still leaves it readable', async () => {
    standIn('claude', { version: NEW, status: `Update available! ${claudeIn}` })
    expect(find(await read(), 'claude').state).toBe('ready')
  })

  it('is read from standard output only: the same JSON on standard error is ignored', async () => {
    standIn('claude', { version: NEW, status: claudeIn, stream: 'stderr' })
    expect(find(await read(), 'claude').state).toBe('cant_tell')
    standIn('claude', { version: NEW, status: claudeOut, other: claudeIn })
    expect(find(await read(), 'claude').state).toBe('signed_out')
  })

  it('a version below 2.1.317 is too old, and its status command is never run', async () => {
    standIn('claude', { version: '2.1.300 (Claude Code)', status: claudeIn })
    expect(find(await read(), 'claude')).toMatchObject({ state: 'too_old', available: true, loggedIn: null, version: '2.1.300 (Claude Code)', reason: null })
    expect(calls('claude')).toEqual(['--version'])
  })

  it('too old to have `claude auth` at all (before 2.1.41): too old, never asked for its status', async () => {
    standIn('claude', { version: '2.0.14 (Claude Code)', status: "error: unknown command 'auth'", statusCode: 1 })
    expect(find(await read(), 'claude')).toMatchObject({ state: 'too_old', version: '2.0.14 (Claude Code)' })
    expect(calls('claude')).toEqual(['--version'])
  })

  it('a version line with no number can’t be shown new enough, so its status isn’t run either', async () => {
    standIn('claude', { version: 'dev build', status: claudeIn })
    expect(find(await read(), 'claude')).toMatchObject({ state: 'cant_tell', available: true, loggedIn: null })
    expect(calls('claude')).toEqual(['--version'])
  })

  it('a program whose --version fails counts as missing', async () => {
    standIn('claude', { version: null, status: claudeIn })
    expect(find(await read(), 'claude')).toMatchObject({ state: 'missing', available: false, version: null, loggedIn: null, reason: "claude --version didn't answer." })
  })

  it('is asked only for its version and its sign-in status', async () => {
    standIn('claude', { version: NEW, status: claudeIn })
    await read()
    expect(calls('claude')).toEqual(['--version', 'auth status --json'])
  })

  it('a missing email gives null, so the window offers a field to type it in', async () => {
    standIn('claude', { version: NEW, status: '{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "pro"}' })
    expect(find(await read(), 'claude')).toMatchObject({ state: 'ready', plan: 'pro', email: null })
  })

  it('terminal colour codes around the JSON are stripped first', async () => {
    standIn('claude', { version: '\x1b[1m2.1.317\x1b[0m (Claude Code)', status: `\x1b[32m${claudeIn}\x1b[0m` })
    expect(find(await read(), 'claude')).toMatchObject({ state: 'ready', version: NEW })
  })
})

describe('Codex', () => {
  it('found and signed in to ChatGPT: ready', async () => {
    const path = standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT' })
    expect(find(await read(), 'codex')).toEqual({
      kind: 'codex',
      name: 'Codex',
      path,
      available: true,
      version: 'codex-cli 0.165.0',
      loggedIn: true,
      reason: null,
      state: 'ready',
      plan: null,
      email: null
    })
  })

  it('found but signed out', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Not logged in', statusCode: 1 })
    expect(find(await read(), 'codex')).toMatchObject({ state: 'signed_out', available: true, loggedIn: false })
  })

  it('a status it can’t read is cant_tell, not signed in', async () => {
    standIn('codex', { version: 'codex-cli 0.1.0', status: "error: unrecognized subcommand 'status'", statusCode: 2 })
    expect(find(await read(), 'codex')).toMatchObject({ state: 'cant_tell', loggedIn: null })
  })

  it('is read from standard error only: its message on standard output is ignored', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT', stream: 'stdout' })
    expect(find(await read(), 'codex').state).toBe('cant_tell')
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Not logged in', other: 'Logged in using ChatGPT' })
    expect(find(await read(), 'codex').state).toBe('signed_out')
  })

  it('a warning line before its status doesn’t matter', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'WARNING: proceeding, even though we could not update PATH\nLogged in using ChatGPT' })
    expect(find(await read(), 'codex').state).toBe('ready')
  })

  it('has no minimum version', async () => {
    standIn('codex', { version: 'codex-cli 0.0.1', status: 'Logged in using ChatGPT' })
    expect(find(await read(), 'codex').state).toBe('ready')
  })

  it('is asked only for its version and its sign-in status', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT' })
    await read()
    expect(calls('codex')).toEqual(['--version', 'login status'])
  })
})

describe('the recorded and copied outputs', () => {
  const sources = JSON.parse(readFileSync(fixture('sources.json'), 'utf8')) as {
    fixtures: { file: string; tool: 'claude' | 'codex'; stream: Stream; source: string; state: string; plan?: string; email?: string }[]
  }

  it('each is marked as recorded or copied', () => {
    for (const f of sources.fixtures) expect(f.source).toMatch(/^(recorded|copied): /)
    expect(sources.fixtures.filter((f) => f.source.startsWith('copied')).map((f) => f.file)).toEqual(
      expect.arrayContaining(['codex-access-token.stderr', 'codex-personal-access-token.stderr', 'codex-bedrock-api-key.stderr', 'codex-workload-identity.stderr'])
    )
  })

  it('holds no real identifier', () => {
    for (const f of sources.fixtures) {
      const text = readFileSync(fixture(f.file), 'utf8')
      for (const email of text.match(/[^\s@"]+@[^\s@"']+\.[a-z]+/g) ?? []) expect(email).toBe('you@example.com')
      for (const home of text.match(/\/Users\/[^/"]+/g) ?? []) expect(home).toBe('/Users/you')
    }
  })

  it.each(sources.fixtures)('$file, on $stream, reads as $state', async (f) => {
    standIn(f.tool, { version: f.tool === 'claude' ? NEW : 'codex-cli 0.165.0', statusFile: fixture(f.file), stream: f.stream })
    expect(find(await read(), f.tool)).toMatchObject({ state: f.state, plan: f.plan ?? null, email: f.email ?? null })
  })
})

describe('a status that takes too long', () => {
  it('reads cant_tell after the limit, its process is left to finish, and no second read starts meanwhile', async () => {
    standIn('claude', { version: NEW, status: claudeIn, sleep: 1 })
    const p = probe({ statusLimitMs: 150 })
    const first = find(await p.getTools(), 'claude')
    expect(first).toMatchObject({ state: 'cant_tell', available: true, loggedIn: null, version: NEW })
    expect(p.isRunning('claude')).toBe(true)
    // A read while it still runs doesn't start another status command.
    expect(find(await p.getTools(), 'claude').state).toBe('cant_tell')
    expect(calls('claude')).toEqual(['--version', 'auth status --json', '--version'])
    // It was never killed: it runs to its end, and its late answer is ignored.
    await waitFor(() => existsSync(join(dir, 'claude.ended')))
    await waitFor(() => !p.isRunning('claude'))
    // Once it has ended, the next read asks again, and this time in time.
    standIn('claude', { version: NEW, status: claudeIn })
    expect(find(await p.getTools(), 'claude').state).toBe('ready')
    expect(calls('claude').filter((c) => c === 'auth status --json')).toHaveLength(2)
  })

  it('a program that exits but leaves a helper holding its output open has still ended', async () => {
    standIn('claude', { version: NEW, status: claudeIn, helper: true })
    const p = probe()
    const started = Date.now()
    expect(find(await p.getTools(), 'claude').state).toBe('ready')
    expect(Date.now() - started).toBeLessThan(3500)
    expect(p.isRunning('claude')).toBe(false)
  })

  it('two reads at once share one status command', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT', sleep: 0.5 })
    const p = probe()
    const [a, b] = await Promise.all([p.getTools(), p.getTools()])
    expect(find(a, 'codex').state).toBe('ready')
    expect(find(b, 'codex').state).toBe('ready')
    expect(calls('codex').filter((c) => c === 'login status')).toHaveLength(1)
  })
})

describe('where the tools are looked for, and what they run with', () => {
  it('only Codex on the Mac: Codex is found and Claude Code is not', async () => {
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT' })
    const tools = await read()
    expect(find(tools, 'claude').state).toBe('missing')
    expect(find(tools, 'codex')).toMatchObject({ state: 'ready', available: true, loggedIn: true })
  })

  it('walks the PATH in order and takes the first folder that has it', async () => {
    const later = join(dir, 'later')
    mkdirSync(later)
    standIn('claude', { version: NEW, status: claudeIn, folder: later })
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
    const chosen = standIn('claude', { version: NEW, status: claudeIn, folder: elsewhere })
    expect(find(await read({ env: { TEARSHEET_CLAUDE_BIN: chosen } }), 'claude')).toMatchObject({ path: chosen, state: 'ready' })
  })

  it('a TEARSHEET_CLAUDE_BIN that doesn’t exist yet counts as missing, at that path', async () => {
    const missing = join(dir, 'test-home', 'claude')
    expect(find(await read({ env: { TEARSHEET_CLAUDE_BIN: missing } }), 'claude')).toMatchObject({ path: missing, state: 'missing', available: false, loggedIn: null })
  })

  it('each read runs with the login shell’s CLAUDE_CONFIG_DIR and CODEX_HOME', async () => {
    standIn('claude', { version: NEW, status: claudeIn })
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Logged in using ChatGPT' })
    await read({ claudeConfigDir: '/Users/you/.claude-work', codexHome: '/Users/you/.codex-work' })
    for (const name of ['claude', 'codex']) {
      const lines = readFileSync(join(dir, `${name}.env`), 'utf8').split('\n').filter(Boolean)
      expect(new Set(lines)).toEqual(new Set(['/Users/you/.claude-work|/Users/you/.codex-work']))
    }
  })
})

describe('the setup log', () => {
  it('logs one status_read per tool read: path, exit, time taken and the state', async () => {
    standIn('claude', { version: NEW, status: claudeIn })
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'Not logged in', statusCode: 1 })
    await read()
    const byTool = Object.fromEntries(entries.map(([event, fields]) => [fields.tool, { event, ...fields }]))
    expect(entries).toHaveLength(2)
    expect(byTool.claude).toMatchObject({ event: 'status_read', path: join(bin, 'claude'), exit: 0, state: 'ready', plan: 'max', value: '2.1.317' })
    expect(byTool.claude.ms).toEqual(expect.any(Number))
    expect(byTool.codex).toMatchObject({ event: 'status_read', exit: 1, state: 'signed_out' })
  })

  it('a missing tool, a status it can’t tell, and an unknown plan each leave an entry', async () => {
    standIn('claude', { version: NEW, status: '{"loggedIn": true, "authMethod": "claude.ai"}' })
    standIn('codex', { version: 'codex-cli 0.165.0', status: 'something new' })
    await read()
    await read({ pathValue: join(dir, 'nowhere') })
    expect(entries.map(([, f]) => [f.tool, f.state, f.plan ?? null])).toEqual(
      expect.arrayContaining([
        ['claude', 'ready', 'missing'],
        ['codex', 'cant_tell', null],
        ['claude', 'missing', null],
        ['codex', 'missing', null]
      ])
    )
  })

  it('never logs the email or the raw output', async () => {
    standIn('claude', { version: NEW, status: claudeIn })
    await read()
    expect(JSON.stringify(entries)).not.toContain('you@example.com')
    expect(JSON.stringify(entries)).not.toContain('loggedIn')
  })
})

describe('readStatus', () => {
  it('reads Claude Code’s JSON with its rules, in order', () => {
    // 1. no JSON object
    expect(readStatus('claude', 'Not logged in. Please run /login').state).toBe('cant_tell')
    expect(readStatus('claude', '').state).toBe('cant_tell')
    expect(readStatus('claude', '[1, 2]').state).toBe('cant_tell')
    // 2. loggedIn false, whatever else it says
    expect(readStatus('claude', '{"loggedIn": false, "authMethod": "claude.ai", "subscriptionType": "max"}').state).toBe('signed_out')
    // 3. loggedIn anything but true
    expect(readStatus('claude', '{"authMethod": "claude.ai"}').state).toBe('cant_tell')
    expect(readStatus('claude', '{"loggedIn": "yes", "authMethod": "claude.ai"}').state).toBe('cant_tell')
    // 4. not a claude.ai sign-in, or another provider
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "api_key"}').state).toBe('api_key')
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "bedrock", "subscriptionType": "max"}').state).toBe('api_key')
    // 5. the free plan
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "free"}')).toEqual({ state: 'free_plan', plan: 'free', email: null })
    // 6. anything else, including a plan it doesn't know or none
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": "team"}')).toEqual({ state: 'ready', plan: 'team', email: null })
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "galaxy"}').state).toBe('ready')
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "claude.ai"}')).toEqual({ state: 'ready', plan: null, email: null })
  })

  it('keeps only a real-looking email', () => {
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "claude.ai", "email": "not an email"}').email).toBeNull()
    expect(readStatus('claude', '{"loggedIn": true, "authMethod": "claude.ai", "email": "you@example.com"}').email).toBe('you@example.com')
  })

  it('reads Codex’s lines: the first known one decides', () => {
    expect(readStatus('codex', 'Logged in using ChatGPT').state).toBe('ready')
    expect(readStatus('codex', 'API key configured - sk-proj-***ABCDE').state).toBe('api_key')
    expect(readStatus('codex', 'Logged in using access token').state).toBe('api_key')
    expect(readStatus('codex', 'Logged in using personal access token').state).toBe('api_key')
    expect(readStatus('codex', 'Logged in using Amazon Bedrock API key').state).toBe('api_key')
    expect(readStatus('codex', 'Logged in using workload identity').state).toBe('api_key')
    expect(readStatus('codex', 'Not logged in').state).toBe('signed_out')
    expect(readStatus('codex', 'Error checking login status: boom').state).toBe('cant_tell')
    expect(readStatus('codex', 'Note: something\nNot logged in\nLogged in using ChatGPT').state).toBe('signed_out')
  })
})

describe('stripTerminalCodes', () => {
  it('takes out colours, links and cursor moves', () => {
    expect(stripTerminalCodes('\x1b[1;32mready\x1b[0m')).toBe('ready')
    expect(stripTerminalCodes('\x1b]8;;https://claude.ai/x\x07link\x1b]8;;\x07')).toBe('link')
    expect(stripTerminalCodes('\x1b]8;;https://claude.ai/x\x1b\\link\x1b]8;;\x1b\\')).toBe('link')
    expect(stripTerminalCodes('a\x1b[2Kb\x1bMc')).toBe('abc')
  })
})
