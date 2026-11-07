import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { TWO_COLUMNS_MIN } from './view'

// The report's own CSS (engine) and the toolbar's Numbers / Text switch (app) must agree on the
// width where the report drops to one column, or the switch would show while both columns do.
test('the app and the engine agree on where the report drops to one column', () => {
  const engine = readFileSync(new URL('../../../../engine/src/tearsheet/render.py', import.meta.url), 'utf8')
  const found = engine.match(/^TWO_COLUMNS_MIN = (\d+)$/m)
  expect(Number(found?.[1])).toBe(TWO_COLUMNS_MIN)
})
