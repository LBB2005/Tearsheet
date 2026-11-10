// A small notice that rises from the bottom right, stays a few seconds, then fades and lifts away.
// It may carry one action, such as Undo after a delete; using it closes the notice. While the
// pointer rests on it or it has the keyboard, it stays (an Undo never slips away under the hand);
// after that it gives a short while more. Esc closes it from inside.

import { useEffect, useRef, useState } from 'react'

import { leaveMs } from '../motion'
import { Spinner } from '../setup/parts'

export interface Notice {
  id: number
  title: string
  text?: string
  tone?: 'ok' | 'stop'
  action?: { label: string; run: () => void }
  // Work is going on (a file being made): a spinner before the title.
  busy?: boolean
  // How long it stays; SHOW_MS by default, ACTION_MS with an action.
  ms?: number
}

export const SHOW_MS = 5000
export const ACTION_MS = 8000
// Once the pointer or the focus leaves, the notice stays at least this much longer.
export const AFTER_MS = 2000

// Give each notice its own `key` (its id), so a new one starts its own timer.
export function Toast({ notice, onDone }: { notice: Notice; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  const timer = useRef(0)
  const left = useRef(notice.ms ?? (notice.action ? ACTION_MS : SHOW_MS))
  const since = useRef(0)
  const held = useRef(0)

  const go = () => {
    setLeaving(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => done.current(), leaveMs())
  }
  const run = (ms: number) => {
    window.clearTimeout(timer.current)
    since.current = Date.now()
    timer.current = window.setTimeout(go, ms)
  }
  const hold = () => {
    held.current += 1
    if (held.current > 1 || leaving) return
    window.clearTimeout(timer.current)
    left.current = Math.max(AFTER_MS, left.current - (Date.now() - since.current))
  }
  const release = () => {
    held.current = Math.max(0, held.current - 1)
    if (held.current === 0 && !leaving) run(left.current)
  }

  useEffect(() => {
    run(left.current)
    return () => window.clearTimeout(timer.current)
    // Each notice keeps the time it was given when it first showed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cls = ['toast4', notice.tone === 'stop' ? 'stop' : '', notice.action || notice.busy ? 'act' : '', notice.busy ? 'busy' : '', leaving ? 'leave' : ''].filter(Boolean).join(' ')
  const action = notice.action
  return (
    <div
      className={cls}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          go()
        }
      }}
    >
      {notice.busy && <Spinner />}
      <div>
        <b>{notice.title}</b>
        {notice.text && <span>{notice.text}</span>}
      </div>
      {action && (
        <button
          onClick={() => {
            action.run()
            go()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
