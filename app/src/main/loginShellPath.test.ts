// loginShellPath.ts against real stand-in shells: small scripts that run the probe's printf the
// way a login shell would, after setting up a profile's variables, or that fail.

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fallbackPath, loginShellPath, parseMarked } from './loginShellPath'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-shell-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

// A shell whose "profile" is `profile`: it prints a greeting (as some profiles do), sets the
// profile's variables, then runs the command it was given (its second argument, after -ilc).
function shell(profile: string): string {
  const path = join(dir, 'shell')
  writeFileSync(path, ['#!/bin/sh', 'echo "Welcome back"', profile, 'exec /bin/sh -c "$2"'].join('\n'))
  chmodSync(path, 0o755)
  return path
}

const HOME = '/Users/you'

describe('the login shell', () => {
  it('gives its PATH, with the usual folders added after it', () => {
    const result = loginShellPath({ shell: shell('PATH=/custom/bin:/usr/bin; export PATH'), env: {}, home: HOME })
    expect(result).toEqual({ path: '/custom/bin:/usr/bin:/opt/homebrew/bin:/usr/local/bin:/Users/you/.local/bin', source: 'login_shell' })
  })

  it('also gives CLAUDE_CONFIG_DIR and CODEX_HOME when the profile sets them', () => {
    const profile = 'PATH=/usr/bin; CLAUDE_CONFIG_DIR=/Users/you/.claude-work; CODEX_HOME=/Users/you/.codex-work; export PATH CLAUDE_CONFIG_DIR CODEX_HOME'
    expect(loginShellPath({ shell: shell(profile), env: {}, home: HOME })).toMatchObject({
      source: 'login_shell',
      claudeConfigDir: '/Users/you/.claude-work',
      codexHome: '/Users/you/.codex-work'
    })
  })

  it('leaves them out when they aren’t set', () => {
    const result = loginShellPath({ shell: shell('PATH=/usr/bin; export PATH'), env: {}, home: HOME })
    expect(result).not.toHaveProperty('claudeConfigDir')
    expect(result).not.toHaveProperty('codexHome')
  })
})

describe('a shell that fails', () => {
  it('one that exits with an error: the usual folders, added to the PATH Tearsheet started with', () => {
    expect(loginShellPath({ shell: shell('exit 3'), env: { PATH: '/usr/bin:/bin' }, home: HOME })).toEqual({
      path: '/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin:/Users/you/.local/bin',
      source: 'shell_failed'
    })
  })

  it('one that prints no markers', () => {
    const path = join(dir, 'quiet')
    writeFileSync(path, '#!/bin/sh\necho "nothing here"\n')
    chmodSync(path, 0o755)
    expect(loginShellPath({ shell: path, env: {}, home: HOME }).source).toBe('shell_failed')
  })

  it('one that doesn’t exist', () => {
    expect(loginShellPath({ shell: join(dir, 'no-such-shell'), env: {}, home: HOME }).source).toBe('shell_failed')
  })

  it('one that hangs is given up on after its limit', () => {
    const result = loginShellPath({ shell: shell('/bin/sleep 5'), env: {}, home: HOME, timeoutMs: 200 })
    expect(result.source).toBe('shell_failed')
  })
})

describe('the pieces', () => {
  it('fallbackPath adds each usual folder once, ending with the official install folder', () => {
    expect(fallbackPath('/opt/homebrew/bin:/usr/bin', HOME)).toBe('/opt/homebrew/bin:/usr/bin:/usr/local/bin:/Users/you/.local/bin')
    expect(fallbackPath(undefined, HOME)).toBe('/opt/homebrew/bin:/usr/local/bin:/Users/you/.local/bin')
  })

  it('parseMarked reads only between the markers, and needs a PATH', () => {
    expect(parseMarked('noise PATH=/evil\n__TEARSHEET_PATH_START__\nPATH=/usr/bin\nCLAUDE_CONFIG_DIR=\nCODEX_HOME=/c\n__TEARSHEET_PATH_END__\nPATH=/later')).toEqual({ path: '/usr/bin', codexHome: '/c' })
    expect(parseMarked('__TEARSHEET_PATH_START__\nPATH=\n__TEARSHEET_PATH_END__')).toBeNull()
    expect(parseMarked('PATH=/usr/bin')).toBeNull()
  })
})
