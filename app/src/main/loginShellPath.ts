// The PATH fix (design item 42; the approach is adapted from Realm, MIT; first-run design item 9).
// An app opened from the Finder doesn't get the user's shell PATH, so `claude`, `codex` and `uv`
// wouldn't be found; nor does it see a CLAUDE_CONFIG_DIR or CODEX_HOME set in the shell profile, so
// it would read a different sign-in than Terminal does. Run the user's login shell once and print
// all three between two marker lines, so anything the shell prints at start-up is ignored. If that
// fails, add the usual install folders.

import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

import { installDir } from '../shared/tools'

const START = '__TEARSHEET_PATH_START__'
const END = '__TEARSHEET_PATH_END__'

export interface LoginShell {
  path: string
  // login_shell: the shell printed the markers. shell_failed: it failed, timed out or printed no
  // markers, so the usual folders were added to the PATH Tearsheet started with.
  source: 'login_shell' | 'shell_failed'
  claudeConfigDir?: string
  codexHome?: string
}

export function fallbackPath(current: string | undefined, home: string = homedir()): string {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', installDir('claude', home)]
  const parts = (current ?? '').split(':').filter(Boolean)
  return [...parts, ...extra.filter((p) => !parts.includes(p))].join(':')
}

// The values between the markers, one NAME=value per line; null with no markers or no PATH.
export function parseMarked(output: string): { path: string; claudeConfigDir?: string; codexHome?: string } | null {
  const start = output.indexOf(START)
  const end = output.indexOf(END, start + START.length)
  if (start < 0 || end < 0) return null
  const values = new Map<string, string>()
  for (const line of output.slice(start + START.length, end).split('\n')) {
    const at = line.indexOf('=')
    if (at > 0) values.set(line.slice(0, at), line.slice(at + 1).trim())
  }
  const path = values.get('PATH')
  if (!path) return null
  const claudeConfigDir = values.get('CLAUDE_CONFIG_DIR') || undefined
  const codexHome = values.get('CODEX_HOME') || undefined
  return { path, ...(claudeConfigDir ? { claudeConfigDir } : {}), ...(codexHome ? { codexHome } : {}) }
}

export interface LoginShellOptions {
  shell?: string
  env?: NodeJS.ProcessEnv
  home?: string
  timeoutMs?: number
}

export function loginShellPath(options: LoginShellOptions = {}): LoginShell {
  const env = options.env ?? process.env
  const home = options.home ?? homedir()
  const shell = options.shell ?? (env.SHELL || '/bin/zsh')
  // Plain "$NAME" works in sh, bash, zsh and fish, and an unset one prints as empty.
  const script = `printf '%s\\n' '${START}' "PATH=$PATH" "CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR" "CODEX_HOME=$CODEX_HOME" '${END}'`
  try {
    const output = execFileSync(shell, ['-ilc', script], {
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 5000,
      env,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const found = parseMarked(output)
    if (found) return { ...found, path: fallbackPath(found.path, home), source: 'login_shell' }
  } catch {
    // fall through to the usual folders
  }
  return { path: fallbackPath(env.PATH, home), source: 'shell_failed' }
}
