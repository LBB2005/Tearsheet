import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// The filter column and the table sit side by side until the page is narrower than the two
// flex bases and the gap; then the column wraps above the table. The container query that
// widens the column must start at that same width, or between the two the column sat 270px wide
// above the table with the rest of the row blank (UI sweep, 15 Nov 2026: at 820 by 600 the
// predictions began 1,100px down).
const css = readFileSync(new URL('./log.css', import.meta.url), 'utf8')
const px = (re: RegExp) => Number(css.match(re)?.[1])

test('the filter column goes full width exactly where it wraps above the table', () => {
  const side = px(/\.logv \.side \{ flex: 1 1 (\d+)px;/)
  const main = px(/\.logv \.main \{ flex: 999 1 (\d+)px;/)
  const gap = px(/\.logv \.split \{[^}]*gap: (\d+)px;/)
  const query = px(/@container \(max-width: (\d+)px\) \{\s*\.logv \.side \{ max-width: none;/)
  expect([side, main, gap, query].every(Number.isFinite)).toBe(true)
  expect(query).toBe(side + gap + main - 1)
})
