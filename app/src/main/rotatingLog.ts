// A log file that can't grow without limit (security audit, 9 Nov 2026). When the file would pass
// `maxBytes`, it becomes `<name>.1`, an older `.1` becomes `.2`, and so on; the oldest past `kept`
// is removed. So the engine's log takes at most (kept + 1) × 5 MB.
//
// Like the plain stream it replaces, it never throws: a log that can't be opened, written or
// rotated (a removed or locked logs folder) must never take the main process down.

import { createWriteStream, mkdirSync, openSync, renameSync, rmSync, statSync, type WriteStream } from 'node:fs'
import { dirname } from 'node:path'

export const LOG_MAX_BYTES = 5 * 1024 * 1024
export const LOG_FILES_KEPT = 3

function fileSize(path: string): number {
  try {
    const info = statSync(path)
    return info.isFile() ? info.size : 0
  } catch {
    return 0
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export class RotatingLog {
  private stream: WriteStream
  private size: number

  constructor(
    readonly path: string,
    readonly maxBytes = LOG_MAX_BYTES,
    readonly kept = LOG_FILES_KEPT
  ) {
    try {
      mkdirSync(dirname(path), { recursive: true })
    } catch {
      // The stream below reports the problem to its own error handler.
    }
    this.size = fileSize(path)
    if (this.size >= maxBytes) this.shift()
    this.stream = this.open()
  }

  write(chunk: string | Uint8Array): void {
    const bytes = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength
    if (this.size > 0 && this.size + bytes > this.maxBytes) {
      // The old stream keeps its file open until its last writes are done, under the new name.
      this.stream.end()
      this.shift()
      this.stream = this.open()
    }
    this.size += bytes
    this.stream.write(chunk)
  }

  end(): void {
    this.stream.end()
  }

  // Opened at once (not when the stream gets round to it), so the file exists before any rename.
  private open(): WriteStream {
    let fd: number | undefined
    try {
      fd = openSync(this.path, 'a', 0o600)
    } catch {
      fd = undefined
    }
    const stream = createWriteStream(this.path, fd === undefined ? { flags: 'a', mode: 0o600 } : { fd })
    stream.on('error', () => undefined)
    this.size = fileSize(this.path)
    return stream
  }

  // engine.log -> engine.log.1 -> … -> engine.log.<kept>; the one past `kept` is removed.
  private shift(): void {
    try {
      rmSync(`${this.path}.${this.kept}`, { force: true })
      for (let n = this.kept - 1; n >= 1; n--) {
        if (isFile(`${this.path}.${n}`)) renameSync(`${this.path}.${n}`, `${this.path}.${n + 1}`)
      }
      if (isFile(this.path)) renameSync(this.path, `${this.path}.1`)
    } catch {
      // Best effort: if a rename fails, the log keeps growing in the same file.
    }
    this.size = 0
  }
}
