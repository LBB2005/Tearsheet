import { expect, test } from 'vitest'

import { feedbackMailto, FEEDBACK_EMAIL, versionLines, type AboutInfo } from './about'

const INFO: AboutInfo = { app: '0.1.0', engine: '0.1.0', macos: '26.1', electron: '33.2.0' }

test('the versions a person can quote', () => {
  expect(versionLines(INFO)).toEqual(['Tearsheet 0.1.0', 'Engine 0.1.0', 'macOS 26.1', 'Electron 33.2.0'])
  expect(versionLines({ ...INFO, engine: null })[1]).toBe('Engine not running')
})

test('the feedback email carries the versions and nothing else of the person’s', () => {
  const url = new URL(feedbackMailto(INFO, 'feedback@example.com'))
  expect(url.protocol).toBe('mailto:')
  expect(url.pathname).toBe('feedback@example.com')
  expect(url.searchParams.get('subject')).toBe('Tearsheet feedback')
  const body = url.searchParams.get('body') ?? ''
  for (const line of versionLines(INFO)) expect(body).toContain(line)
  expect(body.startsWith('What happened, or what would you change?')).toBe(true)
  // Mail shows a + as it is, so spaces are %20.
  expect(feedbackMailto(INFO)).not.toContain('+')
})

test('feedback goes to Tearsheet’s public feedback address', () => {
  expect(FEEDBACK_EMAIL).toBe('lbb.aifinance@gmail.com')
  expect(feedbackMailto(INFO).startsWith('mailto:lbb.aifinance@gmail.com?')).toBe(true)
  expect(new URL(feedbackMailto(INFO)).pathname).toBe(FEEDBACK_EMAIL)
})
