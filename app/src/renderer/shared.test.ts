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
      expect(decl(rule!.body, 'border-radius'), selector).toMatch(/^(999px|var\(--r-pill\))$/)
      expect(rule!.body, selector).not.toMatch(/text-transform:\s*uppercase/)
    }
  })
})

// The shared scale (styles.css :root; UI check of 10 Nov 2026): seven text sizes, five corners and a
// pill, four motion times, one recipe for what floats. A sheet moved onto the scale is listed here,
// and then may not type a size, a corner or a transition time of its own again.
const ON_SCALE = ['styles.css', 'settings/settings.css', 'settings/appearance.css', 'mark/mark.css', 'panel/panel.css']
const outsideRoot = (text: string) => {
  const start = text.indexOf(':root {')
  return (start < 0 ? text : text.slice(0, start) + text.slice(text.indexOf('}', start) + 1)).replace(/\/\*[\s\S]*?\*\//g, '')
}
const root = (() => {
  const text = CSS.find((c) => c.file === 'styles.css')!.text
  const start = text.indexOf(':root {')
  return text.slice(start, text.indexOf('}', start))
})()

describe('the shared scale', () => {
  test('declares every name the sheets use', () => {
    const used = new Set(CSS.flatMap(({ text }) => [...text.matchAll(/var\((--(?:fs|r|dur|ease|float|shadow)-[\w-]+|--focus|--knob)\)/g)].map((m) => m[1])))
    for (const name of used) expect(root, name).toContain(`${name}:`)
  })

  test.each(ON_SCALE)('%s sizes its text with --fs-*', (file) => {
    const text = outsideRoot(CSS.find((c) => c.file === file)!.text)
    expect(text.match(/font-size:\s*[\d.]+px|font:\s*[\d.]+px/g)).toBeNull()
  })

  test.each(ON_SCALE)('%s rounds its corners with --r-*', (file) => {
    const text = outsideRoot(CSS.find((c) => c.file === file)!.text)
    expect(text.match(/[\d.]+px \* var\(--round\)/g)).toBeNull()
    const radii = [...text.matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1].trim())
    for (const r of radii) expect(r, `${file}: border-radius ${r}`).toMatch(/^((var\(--r(-[a-z]+)?\)|50%|0)\s*)+$/)
  })

  test.each(ON_SCALE)('%s times its transitions with --dur-*', (file) => {
    const text = outsideRoot(CSS.find((c) => c.file === file)!.text)
    const raw = [...text.matchAll(/transition:\s*([^;}]+)/g)].flatMap((m) => m[1].match(/(?<![\w-])\d*\.?\d+m?s\b/g) ?? []).filter((t) => !/^0m?s$/.test(t))
    expect(raw).toEqual([])
  })

  // (The sheets' 14 px drop from the toolbar is a different move, and stays.)
  test('menus, pop-overs and the look-up box share one small drop-in', () => {
    const drops = CSS.filter((c) => ON_SCALE.includes(c.file)).flatMap(({ file, text }) => [...text.matchAll(/@keyframes\s+([\w-]+)\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(-[1-6]px\)/g)].map((m) => `${file}: ${m[1]}`))
    expect(drops).toEqual(['styles.css: pop-in'])
  })

  test('what floats is drawn with the one recipe', () => {
    for (const selector of ['.menu4', '.palette', '.toast4']) {
      const rule = rules.find((r) => r.selector === selector)
      expect(rule, selector).toBeDefined()
      expect(decl(rule!.body, 'background'), selector).toBe('var(--float-bg)')
      expect(decl(rule!.body, 'border'), selector).toBe('1px solid var(--float-line)')
      expect(decl(rule!.body, 'box-shadow'), selector).toMatch(/^var\(--shadow-[12]\)$/)
    }
  })

  test('menus never run past the window', () => {
    const menu = rules.find((r) => r.selector === '.menu4')!
    expect(decl(menu.body, 'max-height')).toBeDefined()
    expect(decl(menu.body, 'overflow-y')).toBe('auto')
  })

  test('two scrollbars never meet in a white square', () => {
    expect(rules.some((r) => r.selector.includes('::-webkit-scrollbar-corner') && /background:\s*transparent/.test(r.body))).toBe(true)
  })

  test('spinners keep turning under Reduce motion and Animations Off', () => {
    const text = CSS.find((c) => c.file === 'styles.css')!.text
    expect(text).toMatch(/:root\[data-motion="off"\] \.sp[^{]*\{\s*animation: spin/)
    expect(text).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root \.sp[^{]*\{\s*animation: spin/)
  })
})
