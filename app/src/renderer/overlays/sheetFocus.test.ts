// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'

import { keepTabIn } from './sheetFocus'

afterEach(() => {
  document.body.innerHTML = ''
})

function sheet() {
  document.body.innerHTML = '<button id="behind">Behind</button><div id="box" tabindex="-1"><button id="a">Cancel</button><button id="b" disabled>Off</button><button id="c">Write</button></div>'
  return document.getElementById('box') as HTMLElement
}
const tab = (shiftKey = false) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })
  return e
}

test('Tab from the last control goes back to the first, never to the page behind', () => {
  const box = sheet()
  document.getElementById('c')?.focus()
  const e = tab()
  keepTabIn(e, box)
  expect(e.defaultPrevented).toBe(true)
  expect(document.activeElement?.id).toBe('a')
})

test('Shift-Tab from the first control goes to the last, skipping a disabled one', () => {
  const box = sheet()
  document.getElementById('a')?.focus()
  keepTabIn(tab(true), box)
  expect(document.activeElement?.id).toBe('c')
})

test('from the sheet itself, Tab goes to its first control', () => {
  const box = sheet()
  box.focus()
  keepTabIn(tab(), box)
  expect(document.activeElement?.id).toBe('a')
})

test('Tab between two controls inside is left to the browser', () => {
  const box = sheet()
  document.getElementById('a')?.focus()
  const e = tab()
  keepTabIn(e, box)
  expect(e.defaultPrevented).toBe(false)
})
