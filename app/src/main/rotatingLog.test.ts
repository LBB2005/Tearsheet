import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LOG_FILES_KEPT, LOG_MAX_BYTES, RotatingLog } from './rotatingLog'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tearsheet-rotating-test-'))
  file = join(dir, 'logs', 'engine.log')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const settle = (log: RotatingLog) =>
  new Promise<void>((resolve) => {
    log.end()
    setTimeout(resolve, 50)
  })

describe('the rotating log', () => {
  it('keeps 5 MB a file and three older files by default', () => {
    expect(LOG_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(LOG_FILES_KEPT).toBe(3)
  })

  it('moves the file aside when it would pass the limit, and drops the oldest', async () => {
    const log = new RotatingLog(file, 10, 2)
    for (const line of ['aaaaaaaa\n', 'bbbbbbbb\n', 'cccccccc\n', 'dddddddd\n']) log.write(line)
    await settle(log)
    expect(readFileSync(file, 'utf8')).toBe('dddddddd\n')
    expect(readFileSync(`${file}.1`, 'utf8')).toBe('cccccccc\n')
    expect(readFileSync(`${file}.2`, 'utf8')).toBe('bbbbbbbb\n')
    expect(existsSync(`${file}.3`)).toBe(false)
  })

  it('rotates a file that is already too big when it opens, and is the user’s only', async () => {
    mkdirSync(join(dir, 'logs'))
    writeFileSync(file, 'x'.repeat(20))
    const log = new RotatingLog(file, 10, 3)
    log.write(Buffer.from('new\n'))
    await settle(log)
    expect(readFileSync(file, 'utf8')).toBe('new\n')
    expect(readFileSync(`${file}.1`, 'utf8')).toBe('x'.repeat(20))
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('never throws when the log can’t be written or moved', async () => {
    mkdirSync(file, { recursive: true }) // a folder in the file's place
    const log = new RotatingLog(file, 4, 2)
    expect(() => {
      log.write('more than four bytes\n')
      log.write('and again\n')
    }).not.toThrow()
    await settle(log)
  })
})
