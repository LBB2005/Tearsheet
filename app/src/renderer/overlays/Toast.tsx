// A small notice that rises from the bottom right, stays a few seconds, then fades and lifts away.
// It may carry one action, such as Undo after a delete; using it closes the notice.

import { useEffect, useRef, useState } from 'react'

import { leaveMs } from '../motion'

export interface Notice {
  id: number
  title: string
  text?: string
  tone?: 'ok' | 'stop'
  action?: { label: string; run: () => void }
  // How long it stays; SHOW_MS by default.
  ms?: number
}

const SHOW_MS = 5000

// Give each notice its own `key` (its id), so a new one starts its own timer.
export function Toast({ notice, onDone }: { notice: Notice; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const stay = notice.ms ?? SHOW_MS
    const hide = window.setTimeout(() => setLeaving(true), stay)
    const gone = window.setTimeout(() => done.current(), stay + leaveMs())
    return () => {
      window.clearTimeout(hide)
      window.clearTimeout(gone)
    }
    // Each notice keeps the time it was given when it first showed.
  }, [])

  const cls = ['toast4', notice.tone === 'stop' ? 'stop' : '', notice.action ? 'act' : '', leaving ? 'leave' : ''].filter(Boolean).join(' ')
  const action = notice.action
  return (
    <div className={cls}>
      <div>
        <b>{notice.title}</b>
        {notice.text && <span>{notice.text}</span>}
      </div>
      {action && (
        <button
          onClick={() => {
            action.run()
            setLeaving(true)
            window.setTimeout(() => done.current(), leaveMs())
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
