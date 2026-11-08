import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// The 12-month range's lines and names are the app's up and down colours. Written out as hex,
// they would stay as they are if the tokens in styles.css changed, and the range would no longer
// match the rest of the app.
const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const chart = css('./chart.css')
const tokens = new Map([...css('../styles.css').matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(([, name, hex]) => [name, hex.toLowerCase()]))

test('the 12-month range is drawn in the up and down tokens', () => {
  const uses: [string, string, string][] = [
    ['c-bull', 'stroke', '--up'],
    ['c-bear', 'stroke', '--down'],
    ['c-bulln', 'fill', '--up'],
    ['c-bearn', 'fill', '--down']
  ]
  for (const [cls, prop, token] of uses) {
    const rule = chart.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))
    expect(rule?.[1], cls).toMatch(new RegExp(`${prop}:\\s*var\\(${token}\\)`))
  }
})

test('the chart never copies the up or down colour as hex', () => {
  for (const token of ['--up', '--down']) {
    const hex = tokens.get(token)
    expect(hex, token).toBeTruthy()
    expect(chart.toLowerCase()).not.toContain(hex)
  }
})
