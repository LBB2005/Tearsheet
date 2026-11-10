import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Engine, engineCommand, lastErrorLine, reachesCap, restartCapMessage } from './engine'
import type { SetupEvent, SetupFields } from './setupLog'

describe('where the engine comes from', () => {
  const home = { resourcesPath: '/Applications/Tearsheet.app/Contents/Resources', appPath: '/repo/app', dataDir: '/data' }

  it('is the app’s own copy once Tearsheet is packaged, run on only its own packages', () => {
    expect(engineCommand({ ...home, packaged: true, repo: '/elsewhere' })).toEqual({
      command: '/Applications/Tearsheet.app/Contents/Resources/engine/bin/Tearsheet Engine',
      args: ['-I', '-B', '-m', 'tearsheet.cli', 'serve'],
      cwd: '/data'
    })
  })

  it('is this repository’s engine through uv in development', () => {
    expect(engineCommand({ ...home, packaged: false })).toEqual({
      command: 'uv',
      args: ['run', '--project', '/repo/engine', 'tearsheet-engine', 'serve'],
      cwd: '/repo'
    })
  })

  it('is another checkout’s engine when TEARSHEET_REPO names one', () => {
    expect(engineCommand({ ...home, packaged: false, repo: '/other' })).toMatchObject({
      args: ['run', '--project', '/other/engine', 'tearsheet-engine', 'serve'],
      cwd: '/other'
    })
  })
})

// Real child processes stand in for the engine: a command that doesn't exist, and small Node
// scripts (this test's own Node) that answer like a broken engine would.
let dir: string
let engines: Engine[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-engine-test-'))
})
afterEach(() => {
  for (const engine of engines) engine.stop()
  engines = []
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

function engine(command: string, args: string[] = []): Engine {
  const e = new Engine({ command, args, cwd: dir, env: process.env, logFile: join(dir, 'logs', 'engine.log') })
  engines.push(e)
  return e
}
const node = (script: string) => engine(process.execPath, ['-e', script])
const isRunning = (e: Engine) => (e as unknown as { child: unknown }).child !== null

describe('an engine that can’t start', () => {
  it('answers the calls already waiting, and every later one, with why', async () => {
    const e = engine(join(dir, 'no-such-engine'))
    const fatal = vi.fn()
    const crashed = vi.fn()
    e.on('fatal', fatal)
    e.on('crashed', crashed)
    e.start()
    const waiting = e.request('get_settings')
    await expect(waiting).rejects.toThrow(/^The engine couldn’t start: .*ENOENT/)
    expect(fatal).toHaveBeenCalledTimes(1)
    expect(fatal.mock.calls[0][0]).toMatch(/^The engine couldn’t start/)
    // A later call answers at once, with the same reason, instead of hanging.
    await expect(e.request('get_settings')).rejects.toThrow(/^The engine couldn’t start/)
    expect(e.fatalMessage).toMatch(/^The engine couldn’t start/)
    expect(isRunning(e)).toBe(false)
    expect(crashed).not.toHaveBeenCalled()
  })

  it('is not restarted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const e = engine(join(dir, 'no-such-engine'))
    const crashed = vi.fn()
    e.on('crashed', crashed)
    e.on('fatal', () => undefined)
    e.start()
    await expect(e.request('get_settings')).rejects.toThrow()
    vi.advanceTimersByTime(5000)
    expect(crashed).not.toHaveBeenCalled()
    expect(isRunning(e)).toBe(false)
  })
})

describe('an engine that stops', () => {
  it('answers the calls waiting when it exits, and is restarted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const e = node("process.stdin.once('data', () => process.exit(3))")
    const crashed = vi.fn()
    e.on('crashed', crashed)
    e.start()
    await expect(e.request('get_settings')).rejects.toThrow('The engine stopped.')
    expect(crashed).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(isRunning(e)).toBe(true)
  })

  it('isn’t restarted after stop(), even when stop() comes while the restart waits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const e = node("process.stdin.once('data', () => process.exit(3))")
    e.on('crashed', () => undefined)
    e.start()
    await expect(e.request('get_settings')).rejects.toThrow('The engine stopped.')
    e.stop()
    vi.advanceTimersByTime(5000)
    expect(isRunning(e)).toBe(false)
  })

  it('answers waiting and later calls with the version mismatch when the hello doesn’t match', async () => {
    const hello = JSON.stringify({ jsonrpc: '2.0', method: 'hello', params: { engine_version: 'x', protocol_version: 999 } })
    const e = node(`setTimeout(() => console.log(${JSON.stringify(hello)}), 50); setInterval(() => {}, 1000)`)
    const fatal = vi.fn()
    e.on('fatal', fatal)
    e.start()
    await expect(e.request('get_settings')).rejects.toThrow('The app and engine versions don’t match.')
    expect(fatal).toHaveBeenCalledWith('The app and engine versions don’t match.')
    await expect(e.request('get_settings')).rejects.toThrow('The app and engine versions don’t match.')
  })
})

describe('the engine’s log', () => {
  it('never takes the main process down when it can’t be written', async () => {
    // The log file's place is taken by a folder, so opening it fails (as a removed or locked
    // logs folder would). The engine still answers.
    mkdirSync(join(dir, 'logs', 'engine.log'), { recursive: true })
    const e = node("process.stdin.once('data', () => process.exit(3))")
    e.on('crashed', () => undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    e.start()
    await expect(e.request('get_settings')).rejects.toThrow('The engine stopped.')
  })
})

describe('the restart cap', () => {
  it('counts the third stop within any 30 seconds; older stops don’t count', () => {
    expect(reachesCap([], 100_000)).toBe(false)
    expect(reachesCap([99_000], 100_000)).toBe(false)
    expect(reachesCap([90_000, 99_000], 100_000)).toBe(true)
    expect(reachesCap([60_000, 99_000], 100_000)).toBe(false)
    expect(reachesCap([70_001, 99_000], 100_000)).toBe(true)
  })

  it('names the signal, or the exit code, and points to the first-open steps', () => {
    expect(restartCapMessage('SIGKILL', null)).toMatch(/stopped by SIGKILL three times in 30 seconds/)
    expect(restartCapMessage(null, 9)).toMatch(/with exit code 9/)
    expect(restartCapMessage('SIGKILL', null)).toMatch(/first-open steps/)
  })

  it('gives the engine’s own last words for an exit with a code, and leaves macOS out of it', () => {
    const said = 'This data folder was written by a newer Tearsheet. Update Tearsheet.'
    const message = restartCapMessage(null, 2, said)
    expect(message).toMatch(/with exit code 2/)
    expect(message).toContain(`It said: “${said}”`)
    expect(message).not.toMatch(/macOS/)
    // A signal is still read as macOS, whatever was written.
    expect(restartCapMessage('SIGKILL', null, said)).toMatch(/first-open steps/)
    expect(lastErrorLine('Traceback\n  File x\nKeyError: boom\n\n')).toBe('KeyError: boom')
    expect(lastErrorLine('')).toBeNull()
    expect(lastErrorLine('x'.repeat(400))).toHaveLength(300)
  })

  it('names what an engine that keeps exiting with a code wrote last', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const e = node("process.stderr.write('Database is newer than this engine.\\n'); process.exit(2)")
    const fatal = new Promise<unknown>((resolve) => e.once('fatal', resolve))
    for (let i = 0; i < 2; i++) {
      const crashed = new Promise((resolve) => e.once('crashed', resolve))
      if (i === 0) e.start()
      await crashed
      vi.advanceTimersByTime(1000)
    }
    expect(await fatal).toMatch(/It said: “Database is newer than this engine\.”/)
  })

  it('stops restarting at the third stop in 30 seconds, answers every call with why, and logs it once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const entries: [SetupEvent, SetupFields][] = []
    const e = new Engine({
      command: process.execPath,
      args: ['-e', "process.kill(process.pid, 'SIGKILL')"],
      cwd: dir,
      env: process.env,
      logFile: join(dir, 'logs', 'engine.log'),
      setupLog: { log: (event, fields = {}) => void entries.push([event, fields]) }
    })
    engines.push(e)
    const next = (event: string) => new Promise<unknown>((resolve) => e.once(event, resolve))
    const crashed = vi.fn()
    e.on('crashed', crashed)
    let waiting = next('crashed')
    e.start()
    await waiting
    waiting = next('crashed')
    vi.advanceTimersByTime(1000)
    await waiting
    const fatal = next('fatal')
    vi.advanceTimersByTime(1000)
    const message = (await fatal) as string
    expect(crashed).toHaveBeenCalledTimes(2)
    expect(message).toMatch(/stopped by SIGKILL three times in 30 seconds/)
    expect(e.fatalMessage).toBe(message)
    vi.advanceTimersByTime(5000)
    expect(isRunning(e)).toBe(false)
    await expect(e.request('get_settings')).rejects.toThrow(message)
    expect(entries).toEqual([['engine_restart_cap', { signal: 'SIGKILL', exit: null }]])
    // A later start by hand clears the message, as before.
    e.on('fatal', () => undefined)
    e.start()
    expect(e.fatalMessage).toBeNull()
  })

  it('keeps restarting an engine whose stops are more than 30 seconds apart', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const e = node('process.exit(3)')
    const fatal = vi.fn()
    e.on('fatal', fatal)
    for (let i = 0; i < 4; i++) {
      const crashed = new Promise((resolve) => e.once('crashed', resolve))
      if (i === 0) e.start()
      else vi.advanceTimersByTime(31_000)
      await crashed
    }
    expect(fatal).not.toHaveBeenCalled()
    expect(e.fatalMessage).toBeNull()
  })
})

describe('the run a restart notice names', () => {
  it('follows progress notes (a line’s runs too) and forgets a run once its report is ready', () => {
    const e = node('setInterval(() => undefined, 1000)')
    const feed = (note: object) => (e as unknown as { onLine(line: string): void }).onLine(JSON.stringify(note))
    feed({ jsonrpc: '2.0', method: 'progress', params: { run_id: 'run-line-1', step: 'fetch', state: 'started' } })
    expect(e.lastRunId).toBe('run-line-1')
    feed({ jsonrpc: '2.0', method: 'report_ready', params: { run_id: 'run-other', report_id: 'r' } })
    expect(e.lastRunId).toBe('run-line-1')
    feed({ jsonrpc: '2.0', method: 'report_ready', params: { run_id: 'run-line-1', report_id: 'r' } })
    expect(e.lastRunId).toBeNull()
  })
})
