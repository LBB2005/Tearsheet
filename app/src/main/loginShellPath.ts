// The PATH fix (design item 42; the approach is adapted from Realm, MIT). An app opened from the
// Finder doesn't get the user's shell PATH, so `claude`, `codex` and `uv` wouldn't be found. Run
// the user's login shell once and print PATH between two marker lines, so anything the shell
// prints at start-up is ignored. If that fails, add the usual install folders.

import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const START = '__TEARSHEET_PATH_START__'
const END = '__TEARSHEET_PATH_END__'

export function fallbackPath(current: string | undefined): string {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]
  const parts = (current ?? '').split(':').filter(Boolean)
  return [...parts, ...extra.filter((p) => !parts.includes(p))].join(':')
}

export function parseMarkedPath(output: string): string | null {
  const start = output.indexOf(START)
  const end = output.indexOf(END, start + START.length)
  if (start < 0 || end < 0) return null
  const value = output.slice(start + START.length, end).trim()
  return value || null
}

export function loginShellPath(): string {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const output = execFileSync(shell, ['-ilc', `printf '%s\\n' '${START}' "$PATH" '${END}'`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const found = parseMarkedPath(output)
    if (found) return fallbackPath(found)
  } catch {
    // fall through to the usual folders
  }
  return fallbackPath(process.env.PATH)
}
