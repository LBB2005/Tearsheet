import { expect, test } from 'vitest'

import { closeHides } from './lifecycle'

test('on a Mac, closing the window hides it until Tearsheet quits', () => {
  expect(closeHides('darwin', false)).toBe(true)
  expect(closeHides('darwin', true)).toBe(false)
})

test('elsewhere, closing the window closes it', () => {
  expect(closeHides('linux', false)).toBe(false)
  expect(closeHides('win32', false)).toBe(false)
})
