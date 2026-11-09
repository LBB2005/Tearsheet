import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEBUG_SWITCHES, DEV_VARIABLES, debugSwitches, dropDevHooks, hooksAllowed, TEST_BUILD } from './devHooks'
import { TEST_VARIABLES } from './tools'

describe('who may use the development and test hooks', () => {
  it('a development run and a test build may; a release build may not', () => {
    expect(hooksAllowed(false, false)).toBe(true)
    expect(hooksAllowed(true, true)).toBe(true)
    expect(hooksAllowed(true, false)).toBe(false)
  })

  it('is never a test build unless the build said so', () => {
    expect(TEST_BUILD).toBe(false)
    expect(hooksAllowed(true)).toBe(false)
  })

  it('a release build drops every hook from the environment, and nothing else', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/Users/x' }
    for (const name of DEV_VARIABLES) env[name] = '/somewhere'
    expect(dropDevHooks(env, false)).toEqual([...DEV_VARIABLES])
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/Users/x' })
  })

  it('a development run or test build keeps them', () => {
    const env: NodeJS.ProcessEnv = { TEARSHEET_DATA_DIR: '/tmp/copy', TEARSHEET_HIDDEN_WINDOW: '1' }
    expect(dropDevHooks(env, true)).toEqual([])
    expect(env).toEqual({ TEARSHEET_DATA_DIR: '/tmp/copy', TEARSHEET_HIDDEN_WINDOW: '1' })
  })

  it('covers the audit’s list, every test variable, and every TEARSHEET_ variable the main process reads', () => {
    for (const name of [
      'ELECTRON_RENDERER_URL',
      'TEARSHEET_CLAUDE_BIN',
      'TEARSHEET_CODEX_BIN',
      'TEARSHEET_TEST_TOOLS',
      'TEARSHEET_DATA_DIR',
      'TEARSHEET_DOWNLOADS_DIR',
      'TEARSHEET_HIDDEN_WINDOW',
      ...TEST_VARIABLES
    ]) {
      expect(DEV_VARIABLES).toContain(name)
    }
    // Any process.env.TEARSHEET_* or env.TEARSHEET_* read in the main process must be on the list.
    const files = ['index.ts', 'installSwitch.ts', 'lifecycle.ts', 'tools.ts', 'toolSteps.ts', 'engine.ts']
    const read = new Set<string>()
    for (const file of files) {
      const text = readFileSync(join(__dirname, file), 'utf8')
      for (const match of text.matchAll(/env\.(TEARSHEET_[A-Z_]+|ELECTRON_[A-Z_]+)/g)) read.add(match[1])
    }
    // Set by the main process itself for the engine, never read from outside.
    read.delete('TEARSHEET_PATH')
    expect([...read].filter((name) => !(DEV_VARIABLES as readonly string[]).includes(name))).toEqual([])
  })
})

describe('the remote-debugging switches', () => {
  it('are found on the command line', () => {
    const on = new Set(['remote-debugging-port', 'use-mock-keychain'])
    expect(debugSwitches((name) => on.has(name))).toEqual(['remote-debugging-port'])
    expect(debugSwitches(() => false)).toEqual([])
    expect(DEBUG_SWITCHES).toContain('remote-debugging-pipe')
  })
})
