// The engine's 14 report steps, in order (engine/src/tearsheet/pipeline.py STEPS). The Dock
// progress bar and the moving icon both count along this list.
export const REPORT_STEPS = [
  'resolve',
  'fetch',
  'normalize',
  'text',
  'metrics',
  'score',
  'value',
  'rate',
  'news',
  'extract',
  'narrate',
  'render',
  'verify',
  'save'
] as const

export type StepStates = Record<string, string>

// How far a run has got, as a count of steps behind it (0–14). A step counts once it is done;
// so does every step before the furthest one heard from, because a resumed run only reports the
// steps it still has to do.
export function stepsBehind(states: StepStates): number {
  let behind = 0
  REPORT_STEPS.forEach((step, i) => {
    const state = states[step]
    if (state === 'done') behind = Math.max(behind, i + 1)
    else if (state === 'started' || state === 'failed') behind = Math.max(behind, i)
  })
  return behind
}
