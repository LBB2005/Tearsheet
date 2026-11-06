import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Engine } from './engine'

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
