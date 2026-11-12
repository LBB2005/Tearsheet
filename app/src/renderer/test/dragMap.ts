// Whether a real click on a control reaches it, or starts a window move instead.
//
// The toolbar and the sidebar's top strip drag the window (-webkit-app-region: drag). macOS sees
// those areas before the page does, so a click there never reaches the page unless the control
// under it is a no-drag area of its own. Clicks sent by a test (or over CDP) skip the drag areas
// altogether, so they can't show this; only the CSS and the page order can. Three bugs came from
// it: the Chart button and the Numbers / Text switch (`all: unset` reset their no-drag), and the
// sidebar button (it came before the two strips in the page, and the later area wins).
//
// So this reads the app's own stylesheets and works out each element's -webkit-app-region the
// way Chromium does: by the cascade (!important, then specificity, then order), with `all`
// resetting it, and not inherited. Chromium then lists every drag and no-drag box in page order,
// ignoring z-index, and Electron lets the later box win where they overlap. A control's box is
// covered by its ancestors' boxes and by any other box the test says lies over it (jsdom lays
// nothing out, so overlaps between siblings have to be named).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss, { type AtRule, type Declaration, type Rule } from 'postcss'

export type Region = 'drag' | 'no-drag' | 'none'

// (A path, not a URL: jsdom's URL class isn't the one Node's file functions take.)
const RENDERER = join(dirname(fileURLToPath(import.meta.url)), '..')

// The stylesheets in the order the app loads them (main.tsx, then App.tsx's imports in turn), so
// equal selectors in two sheets resolve as they do in the window.
const SHEETS = ['styles.css', 'home/home.css', 'mark/mark.css', 'log/log.css', 'watch/watch.css', 'panel/panel.css', 'chart/chart.css', 'report/report.css', 'views/views.css', 'settings/settings.css', 'settings/appearance.css', 'setup/setup.css']

interface Entry {
  selector: string
  // The selector with :hover and :active taken out: how it reads while the pointer is pressed on
  // the element (and so on every ancestor of it).
  pressed: string
  specificity: [number, number, number]
  important: boolean
  order: number
  // 'all' resets the region with the rest; otherwise the region's own value.
  prop: 'all' | 'region'
  value: string
  sheet: string
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name)
    if (d.isDirectory()) return cssFiles(path)
    return d.name.endsWith('.css') ? [relative(RENDERER, path)] : []
  })
}

// ---------- specificity ----------

const PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter', 'placeholder', 'selection', 'marker', 'backdrop'])

function splitList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i))
      start = i + 1
    }
  }
  out.push(list.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

function closing(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')' && --depth === 0) return i
  }
  throw new Error(`Unbalanced parentheses in selector: ${s}`)
}

const add = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const more = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export function specificity(selector: string): [number, number, number] {
  let s: [number, number, number] = [0, 0, 0]
  let i = 0
  const ident = () => {
    const m = /^-?[_a-zA-Z -￿][-_a-zA-Z0-9 -￿]*|^\\./.exec(selector.slice(i))
    if (!m) throw new Error(`Can't read the selector "${selector}" at ${i}`)
    i += m[0].length
    return m[0]
  }
  while (i < selector.length) {
    const c = selector[i]
    if (c === '#') {
      i++
      ident()
      s = add(s, [1, 0, 0])
    } else if (c === '.') {
      i++
      ident()
      s = add(s, [0, 1, 0])
    } else if (c === '[') {
      const end = selector.indexOf(']', i)
      i = end + 1
      s = add(s, [0, 1, 0])
    } else if (c === ':') {
      const element = selector[i + 1] === ':'
      i += element ? 2 : 1
      const name = ident().toLowerCase()
      if (selector[i] === '(') {
        const end = closing(selector, i)
        const inner = selector.slice(i + 1, end)
        i = end + 1
        if (name === 'where') continue
        if (name === 'not' || name === 'is' || name === 'has' || name === 'matches') {
          s = add(s, splitList(inner).map(specificity).reduce((a, b) => (more(a, b) >= 0 ? a : b), [0, 0, 0] as [number, number, number]))
        } else s = add(s, element ? [0, 0, 1] : [0, 1, 0])
      } else s = add(s, element || PSEUDO_ELEMENTS.has(name) ? [0, 0, 1] : [0, 1, 0])
    } else if (c === '*' || c === ' ' || c === '>' || c === '+' || c === '~' || c === '\n' || c === '\t') {
      i++
    } else {
      ident()
      s = add(s, [0, 0, 1])
    }
  }
  return s
}

// A selector that styles a part of an element (::placeholder, ::after), not the element itself.
const partOf = (selector: string) => /::|:(before|after|first-line|first-letter)\b/.test(selector)

// ---------- the cascade ----------

let entries: Entry[] | null = null

function load(): Entry[] {
  const found = cssFiles(RENDERER).sort()
  const missing = found.filter((f) => !SHEETS.includes(f))
  if (missing.length) throw new Error(`dragMap.ts doesn't know where these stylesheets load: ${missing.join(', ')}. Add them to SHEETS in load order.`)
  const out: Entry[] = []
  let order = 0
  for (const sheet of SHEETS) {
    const root = postcss.parse(readFileSync(join(RENDERER, sheet), 'utf8'), { from: sheet })
    root.walkDecls((decl: Declaration) => {
      const prop = decl.prop.toLowerCase()
      if (prop !== 'all' && prop !== '-webkit-app-region' && prop !== 'app-region') return
      const rule = decl.parent as Rule
      if (rule.type !== 'rule') return
      // A drag area that comes and goes with a media query can't be read without a layout.
      for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
        if (p.type === 'atrule') throw new Error(`${sheet}: "${rule.selector}" sets ${decl.prop} inside @${(p as AtRule).name}; dragMap.ts can't read that.`)
      }
      order++
      for (const selector of rule.selectors) {
        if (partOf(selector)) continue
        out.push({
          selector,
          pressed: selector.replace(/:(hover|active)\b/g, '') || '*',
          specificity: specificity(selector),
          important: decl.important,
          order,
          prop: prop === 'all' ? 'all' : 'region',
          value: decl.value.trim().toLowerCase(),
          sheet
        })
      }
    })
  }
  return out
}

const matches = (el: Element, selector: string) => {
  // Hover, focus and active states don't hold for an element at rest.
  if (/:(hover|active|focus)/.test(selector)) return false
  return el.matches(selector)
}

// The element's own -webkit-app-region. `pressed`: as it is while the pointer is pressed on it
// (or on something inside it), when :hover and :active hold.
export function regionOf(el: Element, pressed = false): Region {
  entries ??= load()
  const hits = entries.filter((e) => (pressed ? !/:focus/.test(e.pressed) && el.matches(e.pressed) : matches(el, e.selector)))
  if (hits.length === 0) return 'none'
  const win = hits.reduce((a, b) => {
    if (a.important !== b.important) return a.important ? a : b
    return more(a.specificity, b.specificity) > 0 ? a : more(a.specificity, b.specificity) < 0 ? b : a.order > b.order ? a : b
  })
  const value = win.value
  if (value === 'inherit') return el.parentElement ? regionOf(el.parentElement, pressed) : 'none'
  if (win.prop === 'all') return 'none'
  if (value === 'drag' || value === 'no-drag') return value
  // unset, initial, revert: the region isn't inherited, so these all mean none.
  return 'none'
}

const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

export interface Reach {
  // A real click on the element reaches the page.
  reaches: boolean
  // The box that decides it, if any: the last drag or no-drag box over the element.
  by: Element | null
}

// Whether a real click on `el` reaches the page. `over`: other elements whose boxes lie over it.
export function clickReaches(el: Element, over: (Element | null)[] = []): Reach {
  const boxes: { el: Element; region: Region }[] = []
  for (let a: Element | null = el; a; a = a.parentElement) {
    const region = regionOf(a, true)
    if (region !== 'none') boxes.push({ el: a, region })
  }
  for (const o of over) {
    if (!o || o === el || o.contains(el)) continue
    const region = regionOf(o)
    if (region !== 'none') boxes.push({ el: o, region })
  }
  if (boxes.length === 0) return { reaches: true, by: null }
  boxes.sort((a, b) => (before(a.el, b.el) ? -1 : 1))
  const last = boxes[boxes.length - 1]
  return { reaches: last.region === 'no-drag', by: last.el }
}

// The controls on the page that a click is meant for, leaving out hidden copies (the report
// bar's ruler is aria-hidden).
export function controls(root: ParentNode = document): Element[] {
  const all = Array.from(root.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="separator"][tabindex], [tabindex]:not([tabindex="-1"])'))
  return all.filter((el) => !el.closest('[aria-hidden="true"], [hidden], [inert]'))
}

// Every control on the page that a real click wouldn't reach, as "Chart (button.cbtn), under
// header.top" lines, so a failure says which.
export function unreachable(root: ParentNode = document, over: (el: Element) => (Element | null)[] = () => []): string[] {
  return controls(root)
    .map((el) => ({ el, reach: clickReaches(el, over(el)) }))
    .filter((x) => !x.reach.reaches)
    .map(({ el, reach }) => `${describe(el)}, under ${reach.by ? describe(reach.by) : 'nothing'}`)
}

export function describe(el: Element): string {
  const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
  return `${name ? `"${name}" ` : ''}(${el.tagName.toLowerCase()}${cls})`
}

// Every element on the page that drags the window.
export function dragAreas(root: ParentNode = document): Element[] {
  return Array.from(root.querySelectorAll('*')).filter((el) => regionOf(el) === 'drag')
}
