// What the moving Fan icon shows for a run in progress. Steps 1–7 gather and compute the numbers
// (the price line draws), step 8 rates (today's price appears), steps 9–13 write and check (the
// bear, base and bull paths open), and step 14 saves (the brackets lock on).

import { REPORT_STEPS, stepsBehind, type StepStates } from '../../shared/steps'

const DATA = REPORT_STEPS.slice(0, 7)
const RATE = REPORT_STEPS.indexOf('rate')
const WRITE = REPORT_STEPS.slice(8, 13)
// A step that is running counts for a third of its share, so the picture moves as it starts.
const RUNNING_SHARE = 0.35

export interface FanPicture {
  hist: number // how much of the price line is drawn, 0–1
  fan: number // how far the three paths have opened, 0–1
  today: boolean // the amber dot for today's price
  tips: boolean // the dots at the ends of the three paths
  locked: boolean // the brackets locked on: the report is ready
  working: boolean // the slow sweep and breathing glow
  failed: boolean // the glow turns red and the sweep stops
}

export function fanPicture(states: StepStates, opts: { ready?: boolean; failed?: boolean } = {}): FanPicture {
  const ready = Boolean(opts.ready) || states.save === 'done'
  const behind = ready ? REPORT_STEPS.length : stepsBehind(states)
  const share = (steps: readonly string[], first: number) =>
    steps.reduce((sum, step, j) => {
      const state = first + j < behind ? 'done' : states[step]
      return sum + (state === 'done' ? 1 : state === 'started' ? RUNNING_SHARE : 0)
    }, 0) / steps.length
  const failed = !ready && (Boolean(opts.failed) || Object.values(states).includes('failed'))
  return {
    hist: share(DATA, 0),
    fan: share(WRITE, 8),
    today: behind > RATE,
    tips: behind >= 13,
    locked: ready,
    working: !ready && !failed,
    failed
  }
}
