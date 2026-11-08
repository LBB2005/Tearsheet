// The look inside a report's frame. The engine's report page (report.html.j2) draws with the same
// CSS names as the window, at Tearsheet's dark look and full glow, which a report file keeps. In
// the app, one more style block with the look in use goes into the page before it loads, so the
// report follows Settings → Appearance (its glow too). Each value is checked against a strict
// pattern once more as the block is written, so nothing but a colour, a number or one of the
// fixed font stacks can ever reach the page.

import { FONTS } from './looks'
import type { Resolved } from './tokens'

// The names the report page draws with, and the kind of value each takes.
const REPORT: [string, 'hex' | 'rgb' | 'num' | 'font'][] = [
  ['--base', 'hex'],
  ['--ink', 'rgb'],
  ['--shade', 'rgb'],
  ['--shade-k', 'num'],
  ['--panel-a', 'num'],
  ['--line-a', 'num'],
  ['--panel', 'hex'],
  ['--text', 'hex'],
  ['--muted', 'hex'],
  ['--accent', 'hex'],
  ['--accent2', 'hex'],
  ['--accent-lo', 'hex'],
  ['--hold', 'hex'],
  ['--up', 'hex'],
  ['--down', 'hex'],
  ['--readout', 'hex'],
  ['--g1', 'rgb'],
  ['--g2', 'rgb'],
  ['--g3', 'rgb'],
  ['--glow', 'num'],
  ['--wt', 'num'],
  ['--round', 'num'],
  ['--frost', 'num'],
  ['--ui', 'font'],
  ['--base-rgb', 'rgb'],
  ['--text-rgb', 'rgb'],
  ['--accent-rgb', 'rgb'],
  ['--accent2-rgb', 'rgb'],
  ['--up-rgb', 'rgb'],
  ['--hold-rgb', 'rgb'],
  ['--down-rgb', 'rgb']
]

const STACKS = new Set(FONTS.map((f) => f.stack))
const SAFE: Record<'hex' | 'rgb' | 'num' | 'font', (v: string) => boolean> = {
  hex: (v) => /^#[0-9A-Fa-f]{6}$/.test(v),
  rgb: (v) => /^\d{1,3} \d{1,3} \d{1,3}$/.test(v),
  num: (v) => /^-?(\d+|\d*\.\d+)$/.test(v),
  font: (v) => STACKS.has(v)
}

// The style block's contents for a look: ":root{color-scheme:dark;--base:#070B14;…}".
export function reportCss(r: Resolved): string {
  const parts = [`color-scheme:${r.shade === 'light' ? 'light' : 'dark'}`]
  for (const [name, kind] of REPORT) {
    const value = r.tokens[name]
    if (value !== undefined && SAFE[kind](value)) parts.push(`${name}:${value}`)
  }
  if (SAFE.font(r.tokens['--ui'] ?? '')) parts.push(`--num:${r.tokens['--ui']}`)
  return `:root{${parts.join(';')}}`
}

// The report page with the look's block at the end of its <head>, after the page's own names, so
// the look wins. A page with no <head> gets it first.
export function withLook(html: string, css: string): string {
  const block = `<style id="tearsheet-look">${css.replace(/</g, '')}</style>`
  const at = html.search(/<\/head>/i)
  return at < 0 ? block + html : html.slice(0, at) + block + html.slice(at)
}
