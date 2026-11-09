// Whether a screen waits on the person (first-run design §1): while one does and the window is in
// front, the main process reads the AI tools every 5 seconds and sends what changed as a
// tools_changed note, so the window never polls. Several parts can wait at once (two tool rows in
// Settings); the main process hears only the first start and the last end.

import { useEffect } from 'react'

let holds = 0

const tell = (waiting: boolean) => {
  void window.tearsheet.windowState({ waiting })?.catch?.(() => undefined)
}

// Starts waiting, and gives the function that ends this wait (once).
export function holdWaiting(): () => void {
  holds += 1
  if (holds === 1) tell(true)
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    if (holds === 0) tell(false)
  }
}

// Waits on the person while `on`.
export function useWaiting(on: boolean): void {
  useEffect(() => (on ? holdWaiting() : undefined), [on])
}
