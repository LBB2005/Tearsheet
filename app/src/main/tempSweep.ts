// Temporary folders left behind (security audit, 9 Nov 2026). The print folder (downloads.ts) is
// removed when the PDF is made, but an app that was stopped mid-print leaves it, and the look
// tests of older checkouts left theirs. At each launch the main process removes this user's own
// folders of these kinds in the temp folder that are more than a day old. The engine sweeps its
// own (engine/src/tearsheet/tempfiles.py). It never throws.

import { lstat, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const STALE_PREFIXES = ['tearsheet-print-', 'tearsheet-look-'] as const
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export async function sweepStaleTemp(root: string = tmpdir(), now: number = Date.now(), maxAgeMs: number = STALE_AFTER_MS): Promise<number> {
  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return 0
  }
  const uid = process.getuid?.()
  let removed = 0
  for (const name of names) {
    if (!STALE_PREFIXES.some((prefix) => name.startsWith(prefix))) continue
    const path = join(root, name)
    try {
      const info = await lstat(path)
      if (!info.isDirectory() || (uid !== undefined && info.uid !== uid) || now - info.mtimeMs <= maxAgeMs) continue
      await rm(path, { recursive: true, force: true })
      removed += 1
    } catch {
      // Gone already, or not ours to remove.
    }
  }
  return removed
}
