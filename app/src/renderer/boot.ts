// What the window shows while it waits for the engine's first answer (the settings, which say
// whether to open on setup or on home). It is never left blank: empty glass for a moment, then
// "Starting Tearsheet…", then a plain error with the engine's reason.

// "Starting Tearsheet…" appears after this long without an answer.
export const STARTING_AFTER_MS = 1000
// After this long with no answer, the window says so. A late answer still opens the app.
export const GIVE_UP_AFTER_MS = 20_000

export type BootView = { kind: 'blank' } | { kind: 'starting' } | { kind: 'ready' } | { kind: 'failed'; message: string }

export interface BootInput {
  // How long the window has waited so far.
  waitedMs: number
  // The settings answered.
  answered: boolean
  // The settings call failed, with this message.
  error: string | null
  // The engine reported it can't be used (engine_fatal).
  fatal: string | null
}

export function bootView(s: BootInput): BootView {
  if (s.fatal) return { kind: 'failed', message: s.fatal }
  if (s.answered) return { kind: 'ready' }
  if (s.error) return { kind: 'failed', message: s.error }
  if (s.waitedMs >= GIVE_UP_AFTER_MS) return { kind: 'failed', message: 'Tearsheet’s engine didn’t answer within 20 seconds.' }
  if (s.waitedMs >= STARTING_AFTER_MS) return { kind: 'starting' }
  return { kind: 'blank' }
}
