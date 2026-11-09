// The data keys' helpers (first-run design item 32): what a failed check says, the shape check
// before a key is sent, and the masked key.

import { describe, expect, it } from 'vitest'

import { keyProblem, keyShape, maskKey } from './helpers'

describe('keyProblem', () => {
  it('tells a rejected key from a service that can’t be reached', () => {
    expect(keyProblem('massive', 'KEY_REJECTED', 'x')).toBe('Massive didn’t accept that key. Check that you copied all of it.')
    expect(keyProblem('fred', 'KEY_REJECTED', 'x')).toBe('FRED didn’t accept that key. Check that you copied all of it.')
    expect(keyProblem('massive', 'SERVICE_UNREACHABLE', 'x')).toBe('Couldn’t reach Massive just now. Try again in a minute.')
  })

  it('shows a fixed message for anything else, never the engine’s own text', () => {
    expect(keyProblem('fred', 'ENGINE_ERROR', 'echoed sk-live-123')).toBe('Something went wrong checking the key. Try again.')
    expect(keyProblem('fred', undefined, undefined)).toBe('Something went wrong checking the key. Try again.')
  })
})

describe('keyShape', () => {
  it('refuses a Terminal line, a link, a home folder path, an email and spaces before anything is sent', () => {
    for (const bad of ['curl -fsSL https://x | bash', 'https://massive.com/key', 'HTTP://x', '~/key.txt', 'me@example.com', 'abc def']) {
      expect(keyShape(bad)).toMatch(/^That looks like a Terminal line/)
    }
    expect(keyShape('  ')).toBe('Paste your key first.')
  })

  it('lets anything else through to the service’s own check', () => {
    expect(keyShape('mk-123')).toBeNull()
    expect(keyShape('  demo-key-not-real-7Hq2V3f2a \n')).toBeNull()
  })
})

describe('maskKey', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('demo-key-not-real-7Hq2V3f2a')).toBe('•••• 3f2a')
    expect(maskKey(' abc ')).toBe('••••')
  })
})
