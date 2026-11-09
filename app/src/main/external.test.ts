import { describe, expect, test } from 'vitest'

import { isAllowedExternal, isSignInLink, SIGN_IN_HOSTS } from './external'

test('isAllowedExternal', () => {
  expect(isAllowedExternal('https://massive.com/dashboard')).toBe(true)
  expect(isAllowedExternal('https://www.massive.com/x')).toBe(true)
  expect(isAllowedExternal('https://fred.stlouisfed.org/docs/api/api_key.html')).toBe(true)
  expect(isAllowedExternal('https://fredaccount.stlouisfed.org/apikeys')).toBe(true)
  expect(isAllowedExternal('https://claude.ai/')).toBe(true)
  expect(isAllowedExternal('http://massive.com')).toBe(false)
  expect(isAllowedExternal('https://evil.com')).toBe(false)
  expect(isAllowedExternal('https://massive.com.evil.com')).toBe(false)
  expect(isAllowedExternal('javascript:alert(1)')).toBe(false)
  expect(isAllowedExternal('not a url')).toBe(false)
  expect(isAllowedExternal('https://massive.com:8443/x')).toBe(false)
  expect(isAllowedExternal('https://user:pw@massive.com/x')).toBe(false)
  expect(isAllowedExternal('https://massive.com@evil.com')).toBe(false)
  expect(isAllowedExternal('file:///etc/passwd')).toBe(false)
  expect(isAllowedExternal('https://MASSIVE.com/x')).toBe(true)
})

test('nodejs.org is no longer allowed (the old setup screens that linked to it are gone)', () => {
  expect(isAllowedExternal('https://nodejs.org/en/download')).toBe(false)
  expect(isAllowedExternal('https://nodejs.org')).toBe(false)
})

describe('the sign-in hosts', () => {
  test('the list', () => {
    expect(SIGN_IN_HOSTS).toEqual(['claude.ai', 'claude.com', 'auth.openai.com'])
  })

  test('each is accepted by isSignInLink, on https only', () => {
    for (const host of SIGN_IN_HOSTS) {
      expect(isSignInLink(`https://${host}/oauth/authorize?x=1`)).toBe(true)
      expect(isSignInLink(`http://${host}/oauth/authorize`)).toBe(false)
      expect(isSignInLink(`https://${host}:8443/oauth/authorize`)).toBe(false)
      expect(isSignInLink(`https://u:p@${host}/`)).toBe(false)
    }
    for (const bad of ['', 'not a link', 'https://www.claude.ai/', 'https://platform.claude.com/oauth/authorize', 'https://auth.openai.com.evil.example/', 'https://localhost:1455/']) {
      expect(isSignInLink(bad)).toBe(false)
    }
  })

  test('the window can’t open the sign-in hosts it doesn’t already use', () => {
    // claude.ai was already allowed for the window (claude.ai pages such as upgrading a plan).
    expect(isAllowedExternal('https://claude.com/cai/oauth/authorize?x=1')).toBe(false)
    expect(isAllowedExternal('https://auth.openai.com/oauth/authorize?x=1')).toBe(false)
  })

  test('a host list passed in replaces the built-in one', () => {
    expect(isSignInLink('https://sign-in.example/start', ['sign-in.example'])).toBe(true)
    expect(isSignInLink('https://claude.ai/', ['sign-in.example'])).toBe(false)
  })
})
