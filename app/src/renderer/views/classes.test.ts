// The bigger views and the panel share one page with the rest of the app, and every stylesheet
// loads for every screen. A class the views style on its own (`.rbar`, say) also restyles any
// other element of that name: the total return's 8 px bars once squeezed the report's top bar to
// 8 px. So a class the views or the panel style alone must not be one another stylesheet uses.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { expect, test } from 'vitest'

const RENDERER = join(dirname(fileURLToPath(import.meta.url)), '..')
const OWN = ['views/views.css', 'panel/panel.css']

// The panel builds on the price chart's pane (.cpane and its parts) and the shared skeleton, on
// purpose; those stay listed here so a new clash still fails.
const SHARED_ON_PURPOSE = new Set(['cpane', 'cpin', 'narrowp', 'skel'])

function sheets(dir = RENDERER, at = ''): string[] {
  return readdirSync(join(dir, at), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sheets(dir, join(at, e.name)) : e.name.endsWith('.css') ? [join(at, e.name)] : []
  )
}

// Each selector's compound parts, as lists of class names: `.a.b .c` gives [[a, b], [c]].
function compounds(sheet: string): string[][] {
  const out: string[][] = []
  postcss.parse(readFileSync(join(RENDERER, sheet), 'utf8')).walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/.test((rule.parent as postcss.AtRule).name)) return
    for (const selector of rule.selectors) {
      for (const part of selector.split(/[\s>+~]+/)) {
        const names = [...part.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1])
        if (names.length) out.push(names)
      }
    }
  })
  return out
}

test('the views and the panel style no class another stylesheet uses, unless joined with one of their own', () => {
  const elsewhere = new Set(sheets().filter((s) => !OWN.includes(s)).flatMap((s) => compounds(s).flat()))
  const own = new Set(OWN.flatMap((s) => compounds(s).flat()).filter((c) => !elsewhere.has(c)))
  const clashes = OWN.flatMap((sheet) =>
    compounds(sheet)
      // `.vmark.tick` is safe: it only matches an element that also has a views-only class.
      .filter((names) => !names.some((n) => own.has(n)))
      .flat()
      .filter((n) => elsewhere.has(n) && !SHARED_ON_PURPOSE.has(n))
      .map((n) => `${sheet}: .${n}`)
  )
  expect([...new Set(clashes)]).toEqual([])
})
