// Keeps the Mac from going to sleep while the line writes several reports one after another, so
// a list left running isn't paused half-way by the Mac sleeping. It uses Electron's
// powerSaveBlocker in its gentlest form, "prevent-app-suspension": the screen may still turn off,
// and closing the lid still sleeps the Mac. It stays on while the line waits for the plan's usage
// to reset (a pause with `wait_until`), so the line can carry on by itself, and lets go once the
// line has nothing more to write (done or cleared), is paused for Liam (a real problem, or the
// weekly 80%), or when the engine restarts.

import type { Notification } from './engine'

export interface Blocker {
  start(type: 'prevent-app-suspension'): number
  stop(id: number): void
}

interface Notes {
  on(event: 'notification', fn: (note: Notification) => void): unknown
  on(event: 'crashed', fn: () => void): unknown
}

// Whether a note says the line still has reports to write: true or false, or null for a note
// that says nothing about it.
export function lineWantsAwake(note: Notification): boolean | null {
  if (note.method === 'engine_restarted') return false
  if (note.method !== 'line_changed') return null
  const p = note.params
  const waiting = Array.isArray(p.waiting) ? p.waiting.length : 0
  const paused = p.paused as { wait_until?: string | null } | null | undefined
  return (!paused || Boolean(paused.wait_until)) && (Boolean(p.writing) || waiting > 0)
}

export function keepAwakeDuringLine(engine: Notes, blocker: Blocker): void {
  let id: number | null = null
  const apply = (note: Notification) => {
    const want = lineWantsAwake(note)
    if (want === true && id === null) id = blocker.start('prevent-app-suspension')
    else if (want === false && id !== null) {
      blocker.stop(id)
      id = null
    }
  }
  engine.on('notification', apply)
  engine.on('crashed', () => apply({ method: 'engine_restarted', params: {} }))
}
