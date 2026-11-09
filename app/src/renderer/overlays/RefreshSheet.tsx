// The Refresh confirm (shell/refresh.ts): it drops from the toolbar, as the flag sheet does, when
// Refresh is picked in the sidebar or on the report page. It asks the engine's check first
// (plan_line: nothing changes), then says how old each latest report is, what new ones cost, and
// whether they will be official predictions. Write adds them to the line; Esc or Cancel closes it.

import { useEffect, useRef, useState } from 'react'

import type { LinePlan } from '../../shared/protocol'
import { leaveMs } from '../motion'
import { refreshText, type Refreshing } from '../shell/refresh'

export interface RefreshSheetProps {
  asked: Refreshing[]
  // A report is being written, or the line has more: these wait their turn.
  busy: boolean
  // Adds the tickers to the line; answers with what went wrong, or null once they are in it.
  onStart: (tickers: string[]) => Promise<string | null>
  onClose: () => void
}

export function RefreshSheet({ asked, busy, onStart, onClose }: RefreshSheetProps) {
  const [plan, setPlan] = useState<LinePlan | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(document.activeElement)

  useEffect(() => {
    box.current?.focus()
    let live = true
    void window.tearsheet.planLine(asked.map((a) => a.ticker)).then((reply) => {
      if (!live) return
      if (reply.ok && reply.result) setPlan(reply.result)
      else setProblem(reply.error?.message || 'The companies couldn’t be checked.')
    })
    return () => {
      live = false
    }
    // Checked once, as the sheet opens.
  }, [])

  const close = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(() => {
      onClose()
      const back = opener.current
      if (back instanceof HTMLElement && back.isConnected) back.focus()
    }, leaveMs())
  }
  const start = async () => {
    if (!plan || starting || leaving) return
    setStarting(true)
    setProblem(null)
    // When they couldn't be added, the sheet stays open and says why.
    const why = await onStart(plan.items.map((item) => item.ticker))
    setStarting(false)
    if (why) setProblem(why)
    else close()
  }

  const one = asked.length === 1
  const text = plan ? refreshText(asked, plan, { busy }) : null
  const title = text?.title ?? (one ? `Refresh ${asked[0].ticker}?` : `Refresh ${asked.length} reports?`)

  return (
    <>
      <div className={leaving ? 'scrim leave' : 'scrim'} onMouseDown={close} />
      <div
        ref={box}
        tabIndex={-1}
        className={leaving ? 'sheet refresh leave' : 'sheet refresh'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="refresh-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
      >
        <b id="refresh-title">{title}</b>
        {!text && !problem && <p>Checking…</p>}
        {text && text.ages.length > 0 && (
          <ul className="ages" aria-label="Latest reports">
            {text.ages.map((a) => (
              <li key={a.ticker}>
                <b>{a.ticker}</b> {a.text}
              </li>
            ))}
          </ul>
        )}
        {text?.lines.map((line) => <p key={line}>{line}</p>)}
        {text && text.skipped.length > 0 && (
          <ul className="left" aria-label="Left out">
            {text.skipped.map((s) => (
              <li key={s.query}>{s.reason}</li>
            ))}
          </ul>
        )}
        {problem && (
          <p className="why" role="alert">
            {problem}
          </p>
        )}
        <div className="row">
          <button className="plain" onClick={close}>
            {text?.start || (!text && !problem) ? 'Cancel' : 'Close'}
          </button>
          {text?.start && (
            <button className="primary" disabled={starting} onClick={() => void start()}>
              {starting ? 'Starting…' : text.start}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
