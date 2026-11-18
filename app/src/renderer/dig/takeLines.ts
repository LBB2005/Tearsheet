// Dig deeper's AI take (dig/Take.tsx): how its steps, its author line and its endings read. The
// engine writes the take, checks it and fills in every figure (engine dig/take.py); this only
// words what happened.

import type { DigTake, TakeDone, TakeProgress } from '../../shared/protocol'
import { clockTime } from '../home/line'
import { dayOf } from './dig'

export type TakeStep = TakeProgress['step']

export const STEP_LABELS: Record<TakeStep, string> = {
  refreshing: 'Getting today’s numbers',
  writing: 'Writing the take',
  checking: 'Checking it',
  rewriting: 'Rewriting what failed the checks',
  saving: 'Saving'
}

export const EMPTY_ANSWER = 'No sentence on this question passed the checks.'

export function writtenLine(take: DigTake, now: Date = new Date()): string {
  const checked = take.checked_by === 'other' ? `checked by ${take.checker ?? 'the other AI tool'}` : take.checked_by === 'self' ? 'self-checked' : 'code checks only'
  return `Written ${dayOf(take.created_at, now)} by ${take.writer}, ${checked}`
}

// Why a take ended without one saved, in words; null when it was saved.
export function doneMessage(note: TakeDone, now: Date = new Date()): string | null {
  if (note.saved) return null
  if (note.code === 'CANCELLED') return 'The take was cancelled.'
  if (note.code === 'USAGE_LIMIT') return `Your plan’s usage limit is reached. Try again ${note.reset_at ? `after ${clockTime(note.reset_at, now)}` : 'later'}.`
  return `The take wasn’t written: ${note.message ?? 'the engine didn’t say why.'}`
}

export function removedLine(n: number): string {
  return n === 1 ? '1 sentence was removed by the checks.' : `${n} sentences were removed by the checks.`
}
