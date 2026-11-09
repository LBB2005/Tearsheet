import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sweepStaleTemp } from './tempSweep'

let root: string
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tearsheet-sweep-test-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function folder(name: string, ageDays: number): string {
  const path = join(root, name)
  mkdirSync(path)
  writeFileSync(join(path, 'inside'), 'x')
  const when = new Date(NOW - ageDays * DAY)
  utimesSync(path, when, when)
  return path
}

describe('the start-up sweep of temporary folders', () => {
  it('removes old print and look folders, and nothing else', async () => {
    const oldPrint = folder('tearsheet-print-abc', 2)
    const oldLook = folder('tearsheet-look-def', 3)
    const newPrint = folder('tearsheet-print-ghi', 0.1)
    const other = folder('someone-else-123', 5)
    const launcher = folder('tearsheet-launcher-xyz', 5) // the engine's to sweep
    const target = folder('target', 5)
    symlinkSync(target, join(root, 'tearsheet-look-link'))
    expect(await sweepStaleTemp(root, NOW)).toBe(2)
    expect(existsSync(oldPrint) || existsSync(oldLook)).toBe(false)
    for (const kept of [newPrint, other, launcher, target, join(root, 'tearsheet-look-link')]) expect(existsSync(kept)).toBe(true)
  })

  it('never throws', async () => {
    expect(await sweepStaleTemp(join(root, 'missing'), NOW)).toBe(0)
  })
})
