import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  dragWidth,
  keepable,
  keyWidth,
  NUMBERS_BIG_STEP,
  NUMBERS_DEFAULT,
  NUMBERS_KEEP_MAX,
  NUMBERS_MIN,
  NUMBERS_STEP,
  numbersWidth,
  setNumbersWidth,
  shownWidth,
  TEXT_MIN,
  widest,
  widthCss,
  widthMessage
} from './numbersWidth'
import { TWO_COLUMNS_MIN } from './view'

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k)
  }
}

const broken = {
  getItem: () => {
    throw new Error('no storage')
  },
  setItem: () => {
    throw new Error('no storage')
  },
  removeItem: () => {
    throw new Error('no storage')
  }
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const RENDER = read('../../../../engine/src/tearsheet/render.py')
const pyNumber = (name: string) => Number(new RegExp(`^${name} = (\\d+)$`, 'm').exec(RENDER)?.[1])
// render.FRAME_SCRIPT, its string pieces joined as Python joins them.
function frameScript(): string {
  const block = /^FRAME_SCRIPT = \(\n([\s\S]*?)\n\)$/m.exec(RENDER)?.[1] ?? ''
  return [...block.matchAll(/^\s*'([^']*)'$/gm)].map((m) => m[1]).join('')
}

describe('the numbers column’s width, kept', () => {
  test('is the usual width when nothing, or nothing usable, is kept', () => {
    expect(numbersWidth(store())).toBe(NUMBERS_DEFAULT)
    expect(numbersWidth(store({ 'report.numbersWidth': '' }))).toBe(NUMBERS_DEFAULT)
    expect(numbersWidth(store({ 'report.numbersWidth': 'wide' }))).toBe(NUMBERS_DEFAULT)
    expect(numbersWidth(broken)).toBe(NUMBERS_DEFAULT)
    expect(numbersWidth(null)).toBe(NUMBERS_DEFAULT)
  })

  test('is read back in whole pixels, inside the limits', () => {
    expect(numbersWidth(store({ 'report.numbersWidth': '700' }))).toBe(700)
    expect(numbersWidth(store({ 'report.numbersWidth': '700.6' }))).toBe(701)
    expect(numbersWidth(store({ 'report.numbersWidth': '10' }))).toBe(NUMBERS_MIN)
    expect(numbersWidth(store({ 'report.numbersWidth': '99999' }))).toBe(NUMBERS_KEEP_MAX)
  })

  test('is kept, and the usual width is kept as nothing', () => {
    const s = store()
    expect(setNumbersWidth(700.4, s)).toBe(700)
    expect(s.data.get('report.numbersWidth')).toBe('700')
    expect(setNumbersWidth(NUMBERS_DEFAULT, s)).toBe(NUMBERS_DEFAULT)
    expect(s.data.has('report.numbersWidth')).toBe(false)
    expect(setNumbersWidth(Number.NaN, s)).toBe(NUMBERS_DEFAULT)
    // Storage that fails still gives the width back.
    expect(setNumbersWidth(640, broken)).toBe(640)
    expect(setNumbersWidth(640, null)).toBe(640)
    expect(keepable(Number.POSITIVE_INFINITY)).toBe(NUMBERS_DEFAULT)
  })
})

describe('the width shown in a report of a given width', () => {
  test('keeps the text at least TEXT_MIN, then the numbers at least NUMBERS_MIN', () => {
    // A wide report: the numbers keep their width, the text takes the rest.
    expect(shownWidth(700, 1400)).toBe(700)
    // Narrower: the text gives way first, down to its least.
    expect(shownWidth(700, 900)).toBe(900 - TEXT_MIN)
    // Then the numbers, down to theirs.
    expect(shownWidth(700, 500)).toBe(NUMBERS_MIN)
    expect(shownWidth(10, 1400)).toBe(NUMBERS_MIN)
    expect(widest(1400.4)).toBe(1400 - TEXT_MIN)
    expect(widest(100)).toBe(NUMBERS_MIN)
  })

  test('the usual width fits exactly where the report goes to two columns', () => {
    expect(shownWidth(NUMBERS_DEFAULT, TWO_COLUMNS_MIN)).toBe(NUMBERS_DEFAULT)
    expect(NUMBERS_MIN + TEXT_MIN).toBeLessThanOrEqual(TWO_COLUMNS_MIN)
  })

  test('a drag moves it by how far the pointer went, inside the limits', () => {
    expect(dragWidth(548, 600, 700, 1400)).toBe(648)
    expect(dragWidth(548, 600, 2000, 1400)).toBe(1400 - TEXT_MIN)
    expect(dragWidth(548, 600, 0, 1400)).toBe(NUMBERS_MIN)
  })

  test('the keys step it, go to either end, or back to the usual width', () => {
    expect(keyWidth('ArrowLeft', 600, 1400)).toBe(600 - NUMBERS_STEP)
    expect(keyWidth('ArrowRight', 600, 1400)).toBe(600 + NUMBERS_STEP)
    expect(keyWidth('ArrowLeft', 600, 1400, true)).toBe(600 - NUMBERS_BIG_STEP)
    expect(keyWidth('ArrowRight', 1080, 1400, true)).toBe(1400 - TEXT_MIN)
    expect(keyWidth('ArrowLeft', NUMBERS_MIN, 1400)).toBe(NUMBERS_MIN)
    expect(keyWidth('Home', 600, 1400)).toBe(NUMBERS_MIN)
    expect(keyWidth('End', 600, 1400)).toBe(1400 - TEXT_MIN)
    expect(keyWidth('Enter', 600, 1400)).toBe(NUMBERS_DEFAULT)
    expect(keyWidth('a', 600, 1400)).toBeNull()
  })

  test('what the frames are given is a whole number of pixels', () => {
    expect(widthMessage(700.4)).toEqual({ tearsheetNumbersWidth: 700 })
    expect(widthCss(700.6)).toBe(':root{--nums-w:701px}')
  })
})

describe('the app and the engine agree', () => {
  test('on the widths', () => {
    expect(pyNumber('NUMBERS_WIDTH')).toBe(NUMBERS_DEFAULT)
    expect(pyNumber('NUMBERS_MIN')).toBe(NUMBERS_MIN)
    expect(pyNumber('NUMBERS_TEXT_MIN')).toBe(TEXT_MIN)
    // The line over the frame works out the column's edge as the page does.
    const css = read('./report.css')
    expect(css).toContain(`left: calc(clamp(${NUMBERS_MIN}px, var(--nums-w, ${NUMBERS_DEFAULT}px), 100% - ${TEXT_MIN}px) - 4px)`)
  })

  test('on the one script a report page runs, which the window’s policy names by its hash', () => {
    const script = frameScript()
    expect(script).toContain('e.source===parent')
    expect(script).toContain(`e.data.${Object.keys(widthMessage(1))[0]}`)
    expect(script).toContain('"--nums-w"')
    const hash = `sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}`
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read('../index.html'))?.[1] ?? ''
    const scripts = /script-src ([^;]+)/.exec(policy)?.[1].split(' ')
    // 'self' for the app's own files, and that one script: nothing inline beyond it.
    expect(scripts).toEqual(["'self'", `'${hash}'`])
  })
})
