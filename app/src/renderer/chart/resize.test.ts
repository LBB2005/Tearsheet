import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// Resizing the window (an edge dragged, the green button, full screen) or the sidebar moves the
// chart with it at once, as a Mac window's parts do (pages/Report.tsx marks the page .resizing
// in the render whose width changed). The pane's width used to glide for .45 s behind the
// window's edge, and a narrow window swapped the pane's opening animation for another, which
// played the chart's opening again each time the window crossed 1,100 px.
const chart = readFileSync(new URL('./chart.css', import.meta.url), 'utf8')
const rules = [...chart.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body }))
const at = (sel: string) => rules.findIndex((r) => r.sel.split(',').map((s) => s.trim()).includes(sel))

test('a resize moves the chart and its divider with no glide', () => {
  const i = at('.rpage.resizing .cpane')
  expect(i, 'a .rpage.resizing .cpane rule').toBeGreaterThanOrEqual(0)
  expect(rules[i].body).toMatch(/transition:\s*none/)
  // After the snap's glide, which it must win over when both apply.
  expect(i).toBeGreaterThan(at('.dragging.snapped .cpane'))
})

test('a width button, Half or an arrow key still glides the chart', () => {
  expect(rules[at('.cpane')].body).toMatch(/transition:\s*width/)
})

test('a narrow window never swaps the pane’s opening animation', () => {
  for (const r of rules) expect(r.sel, r.sel).not.toMatch(/\.narrow\b[^,]*\.cpane/)
})
