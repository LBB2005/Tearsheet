import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { isAllowedExternal, isSignInLink, isTicker, SIGN_IN_HOSTS } from './external'
import { NEWS_SITES } from './newsSites'

test('isAllowedExternal', () => {
  expect(isAllowedExternal('https://massive.com/dashboard')).toBe(true)
  expect(isAllowedExternal('https://www.massive.com/x')).toBe(true)
  expect(isAllowedExternal('https://fred.stlouisfed.org/docs/api/api_key.html')).toBe(true)
  expect(isAllowedExternal('https://fredaccount.stlouisfed.org/apikeys')).toBe(true)
  expect(isAllowedExternal('https://claude.ai/')).toBe(true)
  expect(isAllowedExternal('https://www.sec.gov/edgar/browse/?CIK=320193')).toBe(true)
  expect(isAllowedExternal('https://sec.gov.evil.com/')).toBe(false)
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

test('isTicker takes a ticker and nothing else', () => {
  for (const t of ['AAPL', 'F', 'BRK.B', 'BF-B']) expect(isTicker(t)).toBe(true)
  for (const t of ['', 'aapl', 'TOOLONGTICKER', 'A B', 'AAPL\n', '$(rm)', 42, null]) expect(isTicker(t)).toBe(false)
})

describe('news links from Dig deeper', () => {
  test('open for https sites on the news allowlist, and their www. form', () => {
    expect(isAllowedExternal('https://www.reuters.com/markets/x')).toBe(true)
    expect(isAllowedExternal('https://reuters.com/markets/x')).toBe(true)
    expect(isAllowedExternal('https://www.fool.com/investing/2026/11/17/x/')).toBe(true)
    expect(isAllowedExternal('https://www.bbc.com/news/business/x')).toBe(true)
    expect(isAllowedExternal('https://www.bbc.com/news/business')).toBe(true)
    expect(isAllowedExternal('https://www.goldmansachs.com/insights/x')).toBe(true)
  })

  test('stay closed off the list, off a listed section, or without https', () => {
    expect(isAllowedExternal('https://www.bbc.com/sport/x')).toBe(false)
    expect(isAllowedExternal('https://www.bbc.com/news/businessx')).toBe(false)
    expect(isAllowedExternal('https://www.goldmansachs.com/careers')).toBe(false)
    expect(isAllowedExternal('https://reuters.com.evil.io/x')).toBe(false)
    expect(isAllowedExternal('https://evilreuters.com/x')).toBe(false)
    expect(isAllowedExternal('https://news.reuters.com/x')).toBe(false)
    expect(isAllowedExternal('http://www.reuters.com/x')).toBe(false)
    expect(isAllowedExternal('https://www.reuters.com:444/x')).toBe(false)
    expect(isAllowedExternal('https://user@www.reuters.com/x')).toBe(false)
  })

  test('the list is the engine\'s shipped news allowlist, every group, as written', () => {
    const yaml = readFileSync(resolve(__dirname, '../../../engine/src/tearsheet/methodology/allowlist.yaml'), 'utf8')
    const shipped = [...yaml.matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((m) => m[1])
    expect(shipped.length).toBeGreaterThan(60)
    expect([...NEWS_SITES]).toEqual(shipped)
  })
})
