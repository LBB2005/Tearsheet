import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// Behind a Full chart (and a chart with no room beside it), the report is hidden (.rmain gets
// visibility: hidden) while it stays loaded. In CSS a child set to visibility: visible is drawn
// even inside a hidden parent, and the frame on show was set to visible: so the report stayed
// drawn under the chart, and showed through the chart's see-through background. The frame on show
// must take its visibility from the report around it instead.
const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const report = css('./report.css')
const chart = css('../chart/chart.css')

test('the frame on show takes its visibility from the report around it', () => {
  expect(report).toMatch(/iframe\.report-frame\.on\s*\{\s*visibility:\s*inherit;\s*\}/)
})

test('no rule draws a report frame as visible on its own', () => {
  for (const sheet of [report, chart]) {
    for (const rule of sheet.match(/[^{}]*report-frame[^{}]*\{[^}]*\}/g) ?? []) expect(rule).not.toMatch(/visibility:\s*visible/)
  }
})

test('the report is hidden behind a Full chart', () => {
  expect(chart).toMatch(/\.rpage\.full \.rmain\s*\{[^}]*visibility:\s*hidden/)
})

test('a narrow window keeps the report beside the chart', () => {
  for (const sheet of [report, chart]) expect(sheet).not.toMatch(/\.narrow [^{]*\.rmain/)
})
