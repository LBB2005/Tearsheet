import { describe, expect, test } from 'vitest'

import { digTake } from '../test/dig'
import { doneMessage, EMPTY_ANSWER, removedLine, STEP_LABELS, writtenLine } from './takeLines'

const NOW = new Date('2026-11-18T09:00:00Z')
const done = (over: object) => ({ take_id: 't', cik: 1, saved: false, code: null, message: null, reset_at: null, ...over })

describe('the take’s lines', () => {
  test('who wrote and checked it', () => {
    expect(writtenLine(digTake(), NOW)).toBe('Written Nov 17 by Claude Code, checked by Codex')
    expect(writtenLine(digTake(320193, { checked_by: 'self', checker: null }), NOW)).toBe('Written Nov 17 by Claude Code, self-checked')
    expect(writtenLine(digTake(320193, { checked_by: 'code', checker: null }), NOW)).toBe('Written Nov 17 by Claude Code, code checks only')
  })

  test('each step reads as what is happening', () => {
    expect(STEP_LABELS).toEqual({
      refreshing: 'Getting today’s numbers',
      writing: 'Writing the take',
      checking: 'Checking it',
      rewriting: 'Rewriting what failed the checks',
      saving: 'Saving'
    })
  })

  test('why a take ended without saving', () => {
    expect(doneMessage(done({ saved: true }), NOW)).toBeNull()
    expect(doneMessage(done({ code: 'CANCELLED', message: 'The take was cancelled.' }), NOW)).toBe('The take was cancelled.')
    const limit = doneMessage(done({ code: 'USAGE_LIMIT', message: 'Usage limit reached.', reset_at: '2026-11-18T15:00:00Z' }), NOW)
    expect(limit).toMatch(/^Your plan’s usage limit is reached\. Try again after .+\.$/)
    expect(doneMessage(done({ code: 'USAGE_LIMIT', message: 'Usage limit reached.' }), NOW)).toBe('Your plan’s usage limit is reached. Try again later.')
    expect(doneMessage(done({ code: 'AI_UNAVAILABLE', message: 'No answer within 300 seconds.' }), NOW)).toBe('The take wasn’t written: No answer within 300 seconds.')
  })

  test('how many sentences the checks removed', () => {
    expect(removedLine(1)).toBe('1 sentence was removed by the checks.')
    expect(removedLine(3)).toBe('3 sentences were removed by the checks.')
    expect(EMPTY_ANSWER).toBe('No sentence on this question passed the checks.')
  })
})
