// The window's shared parts are written once (styles.css), so pages can't drift apart again: the
// buttons, the spinner and the rating tag. Found drifting in the UI check of 9 Nov 2026: seven
// button styles, three copies of the spinner, and four shapes for Buy / Hold / Sell.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, test } from 'vitest'

const RENDERER = new URL('.', import.meta.url).pathname
const sheets = (dir = RENDERER): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sheets(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []))
const CSS = sheets().map((path) => ({ file: relative(RENDERER, path), text: readFileSync(path, 'utf8') }))

// Every rule as "file: selector { body }", comments left out.
const rules = CSS.flatMap(({ file, text }) =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ file, selector: m[1].trim(), body: m[2] }))
)
const decl = (body: string, prop: string) => body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1].trim()

describe('the shared parts', () => {
  test('the buttons are drawn from one rule in styles.css; other sheets only resize them', () => {
    const bases = rules.filter((r) => /(^|,\s*)(\.btn2|button\.primary|button\.plain)(\s*,|$)/.test(r.selector) && /all:\s*unset|background:/.test(r.body))
    expect([...new Set(bases.map((r) => r.file))]).toEqual(['styles.css'])
  })

  test('there is one spinner and one spin', () => {
    const spins = CSS.flatMap(({ file, text }) => [...text.matchAll(/@keyframes\s+([\w-]*spin[\w-]*)/g)].map((m) => `${file}: ${m[1]}`))
    expect(spins).toEqual(['styles.css: spin'])
    expect(rules.filter((r) => /(^|\s)\.sp$/.test(r.selector) && decl(r.body, 'animation')).map((r) => r.file)).toEqual(['styles.css'])
  })

  test('Buy, Hold and Sell are the same round tag in the sidebar, the log and the finished report', () => {
    for (const selector of ['.tag4', '.panels .pill', '.rcpt .pill']) {
      const rule = rules.find((r) => r.selector === selector)
      expect(rule, selector).toBeDefined()
      expect(decl(rule!.body, 'border-radius'), selector).toBe('999px')
      expect(rule!.body, selector).not.toMatch(/text-transform:\s*uppercase/)
    }
  })
})
