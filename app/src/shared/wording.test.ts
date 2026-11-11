import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { ADVICE_LINE, ADVICE_SHORT } from './wording'

const ROOT = join(__dirname, '..', '..', '..')

test('the app and the engine use the same "not advice" words', () => {
  const py = readFileSync(join(ROOT, 'engine/src/tearsheet/wording.py'), 'utf8')
  expect(py).toContain(`ADVICE_SHORT = "${ADVICE_SHORT}"`)
  expect(ADVICE_LINE.startsWith(ADVICE_SHORT)).toBe(true)
})

test('no older "not advice" wording is left in the app, the engine, the README or the release notes', () => {
  // The two wordings before S6 (docs/launch/launch-readiness.md), and the first one's variants.
  const old = ['Research data, not investment advice', 'Research to read, not investment advice', 'Reports are general research, not personalised']
  let found = ''
  for (const phrase of old) {
    try {
      found += execFileSync('git', ['grep', '-n', '-F', phrase, '--', 'app/src', 'engine/src', 'engine/tests', 'README.md', 'scripts/release', ':!app/src/shared/wording.test.ts'], {
        cwd: ROOT,
        encoding: 'utf8'
      })
    } catch {
      // git grep exits 1 when nothing matches.
    }
  }
  expect(found).toBe('')
})
