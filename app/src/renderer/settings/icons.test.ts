import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// The picked topic's icon draws itself in: settings.css gives every part of it a dash of 1, which
// is the whole line only when the part has pathLength 1. A part without it would show as a row
// of tiny dashes, so every part of every topic icon must carry it.
test('every part of every topic icon has pathLength 1, so the draw-in shows whole lines', () => {
  const source = readFileSync(new URL('../pages/Settings.tsx', import.meta.url), 'utf8')
  const icons = source.slice(source.indexOf('const ICONS'), source.indexOf('function TopicList'))
  const parts = icons.match(/<(path|circle|ellipse|rect|line|polyline)\b[^>]*>/g) ?? []
  expect(parts.length).toBeGreaterThanOrEqual(6)
  for (const part of parts) expect(part).toContain('pathLength={1}')
})

test('the draw-in dash in settings.css is the length pathLength gives', () => {
  const css = readFileSync(new URL('./settings.css', import.meta.url), 'utf8')
  expect(css).toMatch(/\.topic\.on svg \*\s*\{[^}]*stroke-dasharray:\s*1;/)
})
