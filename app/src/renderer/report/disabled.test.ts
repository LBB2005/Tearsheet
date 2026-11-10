import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// The segmented switch's buttons are reset with `all: unset`, which also wipes the shared
// `button:disabled` look (styles.css). A span that can't be picked (Total return's 3Y and 5Y, the
// price chart's 5Y without the full history) then looked and pointed like one that can.
const report = readFileSync(new URL('./report.css', import.meta.url), 'utf8')

test('a disabled button in a segmented switch is faded and takes no pointer', () => {
  const rule = report.match(/\.segc button:disabled[^{]*\{([^}]*)\}/)
  expect(rule).not.toBeNull()
  expect(rule?.[1]).toMatch(/opacity:\s*\.45/)
  expect(rule?.[1]).toMatch(/cursor:\s*default/)
})

test('the disabled look comes after the switch button rule it overrides', () => {
  expect(report.indexOf('.segc button:disabled')).toBeGreaterThan(report.indexOf('.segc button {'))
})
