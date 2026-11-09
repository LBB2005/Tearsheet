// Copy the paste command and open Terminal (first-run design §3, item 7). The command is written
// with Electron's clipboard and read back to check it; only on a match is Terminal opened, on the
// home folder. Nothing is typed or run in Terminal: the person pastes the command themselves.
// The window learns which part failed, and each outcome is logged as copy_terminal.

import { spawn as nodeSpawn } from 'node:child_process'
import { homedir } from 'node:os'

import type { TerminalResult } from '../shared/tools'
import { NO_LOG, type SetupLog } from './setupLog'

export interface Clipboard {
  writeText(text: string): void
  readText(): string
}

interface Exiting {
  on(event: 'exit', listener: (code: number | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

export interface TerminalDeps {
  clipboard: Clipboard
  spawn?: (command: string, args: string[], options: { stdio: 'ignore' }) => Exiting
  home?: string
  log?: SetupLog
}

function openTerminal(home: string, spawn: NonNullable<TerminalDeps['spawn']>): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn('/usr/bin/open', ['-a', 'Terminal', home], { stdio: 'ignore' })
      child.on('error', () => resolve(false))
      child.on('exit', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

export async function copyAndOpen(command: string, deps: TerminalDeps): Promise<TerminalResult> {
  let copied = false
  try {
    deps.clipboard.writeText(command)
    copied = deps.clipboard.readText() === command
  } catch {
    copied = false
  }
  const opened = copied ? await openTerminal(deps.home ?? homedir(), deps.spawn ?? nodeSpawn) : false
  ;(deps.log ?? NO_LOG).log('copy_terminal', { copied, opened })
  return { copied, opened }
}
