import { describe, expect, it } from 'vitest'

import { noRealInstallers, TEST_VARIABLES, testMode, TOOLS } from './tools'

describe('the test rules', () => {
  it.each(TEST_VARIABLES)('%s alone turns on no real installers', (name) => {
    expect(noRealInstallers({ [name]: '/tmp/test' })).toBe(true)
  })

  it('nothing set, or only empty values, leaves the real installers on', () => {
    expect(noRealInstallers({})).toBe(false)
    expect(noRealInstallers({ TEARSHEET_CLAUDE_BIN: '', TEARSHEET_TEST_TOOLS: '  ' })).toBe(false)
    expect(noRealInstallers({ TEARSHEET_DATA_DIR: '/tmp/data', TEARSHEET_HIDDEN_WINDOW: '1' })).toBe(false)
  })

  it.each(TEST_VARIABLES)('only TEARSHEET_TEST_TOOLS turns on test mode (%s)', (name) => {
    expect(testMode({ [name]: '/tmp/test' })).toBe(name === 'TEARSHEET_TEST_TOOLS')
  })

  it('an empty test folder is not test mode', () => {
    expect(testMode({ TEARSHEET_TEST_TOOLS: '' })).toBe(false)
  })
})

describe('the tool table', () => {
  it('reads Claude Code’s status from standard output and Codex’s from standard error', () => {
    expect(TOOLS.map((t) => [t.kind, t.statusStream])).toEqual([
      ['claude', 'stdout'],
      ['codex', 'stderr']
    ])
  })
})
