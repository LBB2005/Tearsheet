// The stand-ins for Claude Code and Codex (design item 26): scripts/test-tools/standin and its two
// installers, run for real in a temporary test folder laid out as scripts/try-new-user.sh lays it
// out (the scripts at the top, the stand-in tools under tools/, and the state file).
//
// The stand-ins run with a PATH of trap programs, named like the real tools and the usual shell
// programs, that only note they were run. After each test none of them may have been run, so a
// stand-in never reaches a real Claude Code or Codex. Commands the stand-ins don't answer are also
// run with an empty PATH.

import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('../../../scripts/test-tools/', import.meta.url))
const SCRIPTS = ['standin', 'install-claude.sh', 'install-codex.sh']
const TRAPPED = ['claude', 'codex', 'node', 'bun', 'npm', 'npx', 'curl', 'wget', 'open', 'sh', 'bash', 'zsh', 'env', 'sleep', 'mv', 'cp', 'cat', 'sed', 'awk', 'grep', 'tail', 'touch', 'mkdir', 'chmod', 'dirname', 'basename', 'security', 'plutil', 'python3']
const SLOW = { timeout: 20_000 }

type Tool = 'claude' | 'codex'

let dir: string // the test folder (TEARSHEET_TEST_TOOLS)
let trap: string // the trap programs, outside the test folder

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-standin-test-'))
  for (const name of SCRIPTS) {
    copyFileSync(join(SOURCE, name), join(dir, name))
    chmodSync(join(dir, name), 0o755)
  }
  mkdirSync(join(dir, 'tools'))
  trap = mkdtempSync(join(tmpdir(), 'tearsheet-standin-trap-'))
  for (const name of TRAPPED) {
    writeFileSync(join(trap, name), `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> '${join(trap, 'ran.log')}'\nexit 0\n`)
    chmodSync(join(trap, name), 0o755)
  }
})

afterEach(() => {
  const ran = existsSync(join(trap, 'ran.log')) ? readFileSync(join(trap, 'ran.log'), 'utf8') : ''
  rmSync(dir, { recursive: true, force: true })
  rmSync(trap, { recursive: true, force: true })
  expect(ran, 'a stand-in ran another program').toBe('')
})

const statePath = () => join(dir, 'state')
const readState = () => readFileSync(statePath(), 'utf8')
const writeState = (text: string) => writeFileSync(statePath(), text)
const toolPath = (tool: Tool) => join(dir, 'tools', tool)
function place(tool: Tool): string {
  copyFileSync(join(dir, 'standin'), toolPath(tool))
  chmodSync(toolPath(tool), 0o755)
  return toolPath(tool)
}

interface Result {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  ms: number
}

// Starts a program with its input closed, as the app runs a sign-in, and only the PATH given.
function start(program: string, args: string[], path = trap) {
  const began = Date.now()
  const child = spawn(program, args, { env: { PATH: path }, cwd: trap, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (text: string) => (stdout += text))
  child.stderr.setEncoding('utf8').on('data', (text: string) => (stderr += text))
  const done = new Promise<Result>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr, ms: Date.now() - began }))
  })
  return { child, done }
}
const run = (program: string, args: string[], path?: string) => start(program, args, path).done

// Every file and folder under the test folder, with each file's mode and contents.
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (rel: string) => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const key = rel ? `${rel}/${name}` : name
      const info = statSync(join(dir, key))
      if (info.isDirectory()) {
        out[`${key}/`] = 'folder'
        walk(key)
      } else {
        out[key] = `${(info.mode & 0o777).toString(8)} ${readFileSync(join(dir, key), 'utf8')}`
      }
    }
  }
  walk('')
  return out
}
function changed(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]).sort()
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return true
    await sleep(50)
  }
  return check()
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
function children(pid: number): number[] {
  try {
    return execFileSync('/usr/bin/pgrep', ['-P', String(pid)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number)
  } catch {
    return []
  }
}

const SIGNED_IN = {
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  analyticsDisabled: false,
  projectsDirectory: '/Users/you/.claude/projects',
  configDirectory: '/Users/you/.claude',
  email: 'you@example.com',
  orgId: '00000000-0000-4000-8000-000000000000',
  orgName: 'Stand-in organisation',
  subscriptionType: 'max'
}

describe('Claude Code’s stand-in', () => {
  it.each([
    ['signed_out', '2.1.317 (Claude Code)'],
    ['signed_in', '2.1.317 (Claude Code)'],
    ['api_key', '2.1.317 (Claude Code)'],
    ['too_old', '2.1.300 (Claude Code)']
  ])('%s: --version prints %s on standard output', async (state, version) => {
    writeState(`claude=${state}\n`)
    const result = await run(place('claude'), ['--version'])
    expect(result).toMatchObject({ code: 0, stdout: `${version}\n`, stderr: '' })
  })

  it('signed in: auth status prints its JSON on standard output, with you@example.com and the max plan', async () => {
    writeState('claude=signed_in\n')
    for (const args of [['auth', 'status', '--json'], ['auth', 'status']]) {
      const result = await run(place('claude'), args)
      expect(result).toMatchObject({ code: 0, stderr: '' })
      expect(JSON.parse(result.stdout)).toEqual(SIGNED_IN)
      // Laid out as the real one is: JSON.stringify(status, null, 2).
      expect(result.stdout).toBe(`${JSON.stringify(SIGNED_IN, null, 2)}\n`)
    }
  })

  it('too old: its status reads signed in, as an old copy that is signed in', async () => {
    writeState('claude=too_old\n')
    const result = await run(place('claude'), ['auth', 'status', '--json'])
    expect(result).toMatchObject({ code: 0, stderr: '' })
    expect(JSON.parse(result.stdout)).toEqual(SIGNED_IN)
  })

  it('signed out: loggedIn false, no email, and exit code 1, as the real one', async () => {
    writeState('claude=signed_out\n')
    const result = await run(place('claude'), ['auth', 'status', '--json'])
    expect(result).toMatchObject({ code: 1, stderr: '' })
    const status = JSON.parse(result.stdout)
    expect(status).toMatchObject({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' })
    expect(status).not.toHaveProperty('email')
    expect(status).not.toHaveProperty('subscriptionType')
  })

  it('an API key: authMethod api_key, with no plan and no email', async () => {
    writeState('claude=api_key\n')
    const result = await run(place('claude'), ['auth', 'status', '--json'])
    expect(result).toMatchObject({ code: 0, stderr: '' })
    const status = JSON.parse(result.stdout)
    expect(status).toMatchObject({ loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY' })
    expect(status).not.toHaveProperty('email')
    expect(status).not.toHaveProperty('subscriptionType')
  })

  it('reads signed out when the state file has no line for it, or no state file at all', async () => {
    writeState('codex=signed_in\nlogin=normal\n')
    expect(JSON.parse((await run(place('claude'), ['auth', 'status', '--json'])).stdout).loggedIn).toBe(false)
    rmSync(statePath())
    const result = await run(toolPath('claude'), ['auth', 'status', '--json'])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout).loggedIn).toBe(false)
  })

  it('reads a hand-edited line with a trailing space or a carriage return', async () => {
    writeState('claude=signed_in \r\n')
    expect(JSON.parse((await run(place('claude'), ['auth', 'status', '--json'])).stdout).loggedIn).toBe(true)
  })
})

describe('Codex’s stand-in', () => {
  it.each(['signed_out', 'signed_in', 'api_key'])('%s: --version prints codex-cli 0.165.0 on standard output', async (state) => {
    writeState(`codex=${state}\n`)
    expect(await run(place('codex'), ['--version'])).toMatchObject({ code: 0, stdout: 'codex-cli 0.165.0\n', stderr: '' })
  })

  it.each([
    ['signed_in', 'Logged in using ChatGPT', 0],
    ['api_key', 'API key configured - sk-****', 0],
    ['signed_out', 'Not logged in', 1]
  ])('%s: login status prints “%s” on standard error, with exit code %i', async (state, message, code) => {
    writeState(`codex=${state}\n`)
    expect(await run(place('codex'), ['login', 'status'])).toMatchObject({ code, stdout: '', stderr: `${message}\n` })
  })
})

describe('signing in', () => {
  it(
    'Claude Code: its opening lines and link on the real host, 3 seconds, then “Login successful.”, and only the state file changes',
    async () => {
      writeState('claude=signed_out\ncodex=signed_in\nlogin=normal\ninstall=ok\ncheck=fail\n')
      place('claude')
      place('codex')
      const before = snapshot()
      const result = await run(toolPath('claude'), ['auth', 'login'])
      expect(result).toMatchObject({ code: 0, signal: null, stderr: '' })
      expect(result.ms).toBeGreaterThanOrEqual(2900)
      const url = 'https://claude.ai/oauth/authorize?standin=1'
      expect(result.stdout).toBe(
        'Opening browser to sign in…\n' +
          `If the browser didn't open, visit: \x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\\n` +
          'Paste code here if prompted > Login successful.\n'
      )
      expect(changed(before, snapshot())).toEqual(['state'])
      expect(readState()).toBe('claude=signed_in\ncodex=signed_in\nlogin=normal\ninstall=ok\ncheck=fail\n')
      expect(JSON.parse((await run(toolPath('claude'), ['auth', 'status', '--json'])).stdout).loggedIn).toBe(true)
    },
    SLOW
  )

  it(
    'Codex: signs out first, then in after 3 seconds, all on standard error, and only the state file changes',
    async () => {
      writeState('claude=signed_in\ncodex=api_key\nlogin=normal\n')
      place('claude')
      place('codex')
      const before = snapshot()
      const login = start(toolPath('codex'), ['login'])
      expect(await until(() => readState().includes('codex=signed_out'), 2000)).toBe(true)
      expect(login.child.exitCode).toBeNull()
      expect(readState()).toBe('claude=signed_in\ncodex=signed_out\nlogin=normal\n')
      const result = await login.done
      expect(result).toMatchObject({ code: 0, signal: null, stdout: '' })
      expect(result.ms).toBeGreaterThanOrEqual(2900)
      expect(result.stderr).toContain('Starting local login server on http://localhost:1455.\n')
      expect(result.stderr).toContain('\nhttps://auth.openai.com/oauth/authorize?standin=1\n')
      expect(result.stderr.endsWith('Successfully logged in\n')).toBe(true)
      expect(changed(before, snapshot())).toEqual(['state'])
      expect(readState()).toBe('claude=signed_in\ncodex=signed_in\nlogin=normal\n')
      expect(await run(toolPath('codex'), ['login', 'status'])).toMatchObject({ code: 0, stderr: 'Logged in using ChatGPT\n' })
    },
    SLOW
  )

  it(
    'a too-old Claude Code stays too old when it signs in',
    async () => {
      writeState('claude=too_old\n')
      place('claude')
      const before = snapshot()
      const result = await run(toolPath('claude'), ['auth', 'login'])
      expect(result.code).toBe(0)
      expect(result.stdout.endsWith('Login successful.\n')).toBe(true)
      expect(changed(before, snapshot())).toEqual([])
      expect(readState()).toBe('claude=too_old\n')
    },
    SLOW
  )

  it(
    'login=hang: both sign-ins wait until they are stopped, and stopping one leaves no program running',
    async () => {
      writeState('claude=signed_out\ncodex=signed_in\nlogin=hang\n')
      const claude = start(place('claude'), ['auth', 'login'])
      const codex = start(place('codex'), ['login'])
      await sleep(3500)
      expect(claude.child.exitCode).toBeNull()
      expect(codex.child.exitCode).toBeNull()
      // Codex has already signed out, as the real one has by then; Claude Code saved nothing.
      expect(readState()).toBe('claude=signed_out\ncodex=signed_out\nlogin=hang\n')
      const waits = [...children(claude.child.pid!), ...children(codex.child.pid!)]
      expect(waits).toHaveLength(2)
      claude.child.kill('SIGTERM')
      codex.child.kill('SIGTERM')
      const [claudeResult, codexResult] = await Promise.all([claude.done, codex.done])
      expect(claudeResult).toMatchObject({ code: null, signal: 'SIGTERM' })
      expect(claudeResult.stdout).not.toContain('Login successful.')
      expect(codexResult).toMatchObject({ code: null, signal: 'SIGTERM' })
      expect(codexResult.stderr).not.toContain('Successfully logged in')
      expect(await until(() => waits.every((pid) => !alive(pid)), 2000)).toBe(true)
      expect(readState()).toBe('claude=signed_out\ncodex=signed_out\nlogin=hang\n')
    },
    SLOW
  )
})

describe('the stand-in installers', () => {
  it.each([
    ['claude', 'install-claude.sh', '✅ Installation complete!'],
    ['codex', 'install-codex.sh', 'Codex CLI 0.165.0 installed successfully.']
  ] as const)(
    '%s: copies the stand-in to tools/, prints the real installer’s success line and sets signed_out',
    async (tool, script, success) => {
      writeState('login=normal\ninstall=ok\ncheck=pass\n')
      const result = await run(join(dir, script), [])
      expect(result).toMatchObject({ code: 0, stderr: '' })
      expect(result.stdout).toContain(success)
      expect(readFileSync(toolPath(tool), 'utf8')).toBe(readFileSync(join(dir, 'standin'), 'utf8'))
      expect(statSync(toolPath(tool)).mode & 0o777).toBe(0o755)
      expect(readState()).toBe(`login=normal\ninstall=ok\ncheck=pass\n${tool}=signed_out\n`)
      expect((await run(toolPath(tool), ['--version'])).code).toBe(0)
    },
    SLOW
  )

  it(
    'an install over a too-old Claude Code changes its line in place, to signed_out',
    async () => {
      writeState('claude=too_old\ncodex=signed_in\n')
      place('claude')
      const result = await run(join(dir, 'install-claude.sh'), [])
      expect(result.code).toBe(0)
      expect(readState()).toBe('claude=signed_out\ncodex=signed_in\n')
      expect((await run(toolPath('claude'), ['--version'])).stdout).toBe('2.1.317 (Claude Code)\n')
    },
    SLOW
  )

  it.each(['install-claude.sh', 'install-codex.sh'])(
    'install=fail: %s prints a download error, exits with code 22 as curl -f does, and changes nothing',
    async (script) => {
      writeState('claude=signed_out\ninstall=fail\n')
      const before = snapshot()
      const result = await run(join(dir, script), [])
      expect(result).toMatchObject({ code: 22, stdout: '' })
      expect(result.stderr).toContain('curl: (22)')
      expect(changed(before, snapshot())).toEqual([])
    },
    SLOW
  )
})

describe('anything else', () => {
  const others: Array<[Tool, string, string[]]> = [
    ...(
      [[], ['-p', 'hello'], ['--help'], ['-v'], ['--version', '--verbose'], ['auth'], ['auth', 'logout'], ['auth', 'login', '--console'], ['auth', 'status', '--text'], ['auth status'], ['update'], ['install'], ['doctor'], ['mcp', 'list'], ['setup-token']] as string[][]
    ).map((args): [Tool, string, string[]] => ['claude', 'Claude Code', args]),
    ...(
      [[], ['exec', 'hello'], ['--help'], ['-V'], ['logout'], ['login', '--with-api-key'], ['login', '--device-auth'], ['login', 'status', '--json'], ['login status'], ['update'], ['mcp', 'list'], ['app-server']] as string[][]
    ).map((args): [Tool, string, string[]] => ['codex', 'Codex', args])
  ]

  it.each(others)('%s %j fails with exit code 1 and starts no other program, with an empty PATH', async (tool, name, args) => {
    writeState(`${tool}=signed_in\n`)
    place(tool)
    const before = snapshot()
    const result = await run(toolPath(tool), args, '')
    expect(result).toEqual({ code: 1, signal: null, stdout: '', stderr: `Stand-in: not a real ${name}\n`, ms: expect.any(Number) })
    expect(changed(before, snapshot())).toEqual([])
  })

  it('the stand-in under its own name answers nothing', async () => {
    writeState('claude=signed_in\n')
    const result = await run(join(dir, 'standin'), ['--version'], '')
    expect(result).toMatchObject({ code: 1, stdout: '' })
    expect(result.stderr).toContain('Stand-in: not a real Claude Code or Codex')
  })

  it.each([
    ['claude', 'signedin'],
    ['codex', 'too_old']
  ] as const)('a state it doesn’t know (%s=%s) fails every command with exit code 1', async (tool, state) => {
    writeState(`${tool}=${state}\n`)
    place(tool)
    for (const args of [['--version'], tool === 'claude' ? ['auth', 'status', '--json'] : ['login', 'status']]) {
      const result = await run(toolPath(tool), args, '')
      expect(result).toMatchObject({ code: 1, stdout: '' })
      expect(result.stderr).toContain(`${tool}=${state}`)
    }
  })
})
