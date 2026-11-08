// The look inside a report's frame: one style block of names and safe values, after the page's own.

import { describe, expect, test } from 'vitest'

import { reportCss, withLook } from './report'
import { DEFAULT_APPEARANCE } from './themeFile'
import { resolve } from './tokens'

describe('the look’s block', () => {
  test('carries the default look with Liam’s 40% glow', () => {
    const css = reportCss(resolve(DEFAULT_APPEARANCE))
    expect(css.startsWith(':root{color-scheme:dark;')).toBe(true)
    expect(css).toContain('--glow:.4')
    expect(css).toContain('--accent:#7FE3F7')
    expect(css).toContain('--g1:32 120 150')
    expect(css).toContain('--accent-lo:#4C8DFF')
    expect(css).toContain('--num:"Avenir Next", "Helvetica Neue", sans-serif')
    // The panels keep the page's own sum unless the glass is solid.
    expect(css).not.toContain('--panel:')
  })

  test('follows a light look, solid glass and another font', () => {
    const css = reportCss(resolve({ ...DEFAULT_APPEARANCE, mode: 'light', glass: 'solid', font: 'ny' }))
    expect(css).toContain('color-scheme:light')
    expect(css).toMatch(/--panel:#[0-9A-F]{6}/)
    expect(css).toContain('--ui:ui-serif, "New York", Georgia, serif')
  })

  test('only the report’s names, each with a safe value', () => {
    const css = reportCss(resolve({ ...DEFAULT_APPEARANCE, colours: { 'chart-company': '#FFFFFF' } }))
    for (const [, name, value] of css.slice(6, -1).matchAll(/(--[\w-]+):([^;]+)/g)) {
      expect(name).toMatch(/^--(base|ink|shade|shade-k|panel-a|line-a|panel|text|muted|accent|accent2|accent-lo|hold|up|down|readout|g1|g2|g3|glow|wt|round|frost|ui|num)$/)
      expect(value).not.toMatch(/[<>{}]|url\(|;/)
    }
  })

  test('drops any value that isn’t a colour, a number or one of the fonts, even one put there by hand', () => {
    const r = resolve(DEFAULT_APPEARANCE)
    const hostile = {
      ...r,
      tokens: { ...r.tokens, '--accent': 'red;}</style><script>alert(1)</script>', '--ink': '255 255 255; background: url(x)', '--glow': '1e9', '--ui': 'Comic Sans", sans-serif; } body { display: none', '--text': 'expression(alert(1))' }
    }
    const css = reportCss(hostile)
    expect(css).not.toContain('--accent:')
    expect(css).not.toContain('--ink:')
    expect(css).not.toContain('--glow:')
    expect(css).not.toContain('--ui:')
    expect(css).not.toContain('--num:')
    expect(css).not.toContain('--text:')
    expect(css).not.toMatch(/script|url|display/)
  })
})

describe('putting it in the page', () => {
  test('goes at the end of the head, after the page’s own names', () => {
    const page = '<html><head><style>:root{--glow:1}</style></head><body>Hi</body></html>'
    expect(withLook(page, ':root{--glow:.4}')).toBe('<html><head><style>:root{--glow:1}</style><style id="tearsheet-look">:root{--glow:.4}</style></head><body>Hi</body></html>')
  })

  test('finds the head whatever its case, and goes first in a page with none', () => {
    expect(withLook('<HEAD></HEAD>', 'x')).toBe('<HEAD><style id="tearsheet-look">x</style></HEAD>')
    expect(withLook('<body>Hi</body>', 'x')).toBe('<style id="tearsheet-look">x</style><body>Hi</body>')
  })

  test('can never close its own style block', () => {
    expect(withLook('<head></head>', ':root{}</style><script>alert(1)</script>')).not.toContain('</style><script>')
  })
})
