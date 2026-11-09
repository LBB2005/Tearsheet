// terminal.ts with a fake clipboard and a fake spawn: nothing is copied or opened for real.

import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import type { SetupEvent, SetupFields } from './setupLog'
import { copyAndOpen, type Clipboard } from './terminal'

function clipboard(readBack?: string): Clipboard & { text: string } {
  const board = {
    text: '',
    writeText: (t: string) => {
      board.text = t
    },
    readText: () => readBack ?? board.text
  }
  return board
}

function spawner(outcome: { code?: number; error?: boolean; throws?: boolean }) {
  return vi.fn((_command: string, _args: string[]) => {
    if (outcome.throws) throw new Error('no spawn')
    const child = new EventEmitter()
    setTimeout(() => (outcome.error ? child.emit('error', new Error('ENOENT')) : child.emit('exit', outcome.code ?? 0)), 0)
    return child
  })
}

function logger() {
  const entries: [SetupEvent, SetupFields][] = []
  return { entries, log: { log: (event: SetupEvent, fields: SetupFields = {}) => void entries.push([event, fields]) } }
}

const COMMAND = 'set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash && /Users/you/.local/bin/claude auth login'

describe('copyAndOpen', () => {
  it('copies the command, checks it, then opens a Terminal window on the home folder', async () => {
    const board = clipboard()
    const spawn = spawner({ code: 0 })
    const { entries, log } = logger()
    expect(await copyAndOpen(COMMAND, { clipboard: board, spawn, home: '/Users/you', log })).toEqual({ copied: true, opened: true })
    expect(board.text).toBe(COMMAND)
    expect(spawn).toHaveBeenCalledWith('/usr/bin/open', ['-a', 'Terminal', '/Users/you'], { stdio: 'ignore' })
    expect(entries).toEqual([['copy_terminal', { copied: true, opened: true }]])
  })

  it('a copy that doesn’t read back opens nothing, and says the copy failed', async () => {
    const spawn = spawner({ code: 0 })
    const { entries, log } = logger()
    expect(await copyAndOpen(COMMAND, { clipboard: clipboard('something else'), spawn, home: '/Users/you', log })).toEqual({ copied: false, opened: false })
    expect(spawn).not.toHaveBeenCalled()
    expect(entries).toEqual([['copy_terminal', { copied: false, opened: false }]])
  })

  it('a clipboard that throws counts as a failed copy', async () => {
    const board = { writeText: () => { throw new Error('locked') }, readText: () => '' }
    expect(await copyAndOpen(COMMAND, { clipboard: board, spawn: spawner({ code: 0 }), home: '/Users/you' })).toEqual({ copied: false, opened: false })
  })

  it.each([
    ['exits with an error', { code: 1 }],
    ['can’t be started', { error: true }],
    ['throws', { throws: true }]
  ])('says Terminal didn’t open when open %s', async (_why, outcome) => {
    const { entries, log } = logger()
    expect(await copyAndOpen(COMMAND, { clipboard: clipboard(), spawn: spawner(outcome), home: '/Users/you', log })).toEqual({ copied: true, opened: false })
    expect(entries).toEqual([['copy_terminal', { copied: true, opened: false }]])
  })
})
