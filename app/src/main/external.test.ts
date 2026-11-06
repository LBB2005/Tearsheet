import { expect, test } from 'vitest'

import { isAllowedExternal } from './external'

test('isAllowedExternal', () => {
  expect(isAllowedExternal('https://massive.com/dashboard')).toBe(true)
  expect(isAllowedExternal('https://www.massive.com/x')).toBe(true)
  expect(isAllowedExternal('https://fred.stlouisfed.org/docs/api/api_key.html')).toBe(true)
  expect(isAllowedExternal('https://fredaccount.stlouisfed.org/apikeys')).toBe(true)
  expect(isAllowedExternal('https://nodejs.org/en/download')).toBe(true)
  expect(isAllowedExternal('https://claude.ai/')).toBe(true)
  expect(isAllowedExternal('http://massive.com')).toBe(false)
  expect(isAllowedExternal('https://evil.com')).toBe(false)
  expect(isAllowedExternal('https://massive.com.evil.com')).toBe(false)
  expect(isAllowedExternal('javascript:alert(1)')).toBe(false)
  expect(isAllowedExternal('not a url')).toBe(false)
})
