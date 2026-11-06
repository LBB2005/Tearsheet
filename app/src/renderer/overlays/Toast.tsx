// A small notice that rises from the bottom right, stays a few seconds, then fades and lifts away.

import { useEffect, useRef, useState } from 'react'

import { leaveMs } from '../motion'

export interface Notice {
  id: number
  title: string
  text?: string
  tone?: 'ok' | 'stop'
}

const SHOW_MS = 5000

// Give each notice its own `key` (its id), so a new one starts its own timer.
export function Toast({ notice, onDone }: { notice: Notice; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const hide = window.setTimeout(() => setLeaving(true), SHOW_MS)
    const gone = window.setTimeout(() => done.current(), SHOW_MS + leaveMs())
    return () => {
      window.clearTimeout(hide)
      window.clearTimeout(gone)
    }
  }, [])

  const cls = ['toast4', notice.tone === 'stop' ? 'stop' : '', leaving ? 'leave' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <b>{notice.title}</b>
      {notice.text && <span>{notice.text}</span>}
    </div>
  )
}
