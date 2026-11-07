import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { VIEWS } from './navigation'

describe('the views the engine can link to', () => {
  it('are the same names as the ones the app opens', () => {
    const source = readFileSync(join(__dirname, '../../../engine/src/tearsheet/render.py'), 'utf8')
    const tuple = /^OPEN_VIEWS = \(([^)]*)\)/m.exec(source)
    expect(tuple).not.toBeNull()
    const names = [...(tuple?.[1] ?? '').matchAll(/"([a-z]+)"/g)].map((m) => m[1])
    expect(names).toEqual([...VIEWS])
  })
})
