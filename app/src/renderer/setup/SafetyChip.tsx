// The safety check (the lock-down check, Technical Plan §4) at the top right of setup's toolbar,
// from step 5 on, and of the app's toolbar after setup while a check runs (first-run design CUJ 6):
// "Safety check, 7 of 25" with a small ring and the minutes so far. Clicking it lists the six
// things being checked, in plain words, with a tick as each one passes, and "Stop the check"
// while it runs. Its state comes from the engine's safety_progress and safety_done notes, which
// App keeps (applySafetyNote) so the sidebar's status line can follow the same check after setup.

import { useEffect, useRef, useState } from 'react'

import { CheckIcon, Ring, Spinner } from './parts'
import { checkText, checksPassed, SAFETY_CHECKS, safetyMinutes, type SafetyView, type ToolText } from './steps'

// The clock for the minutes so far: read again every 15 seconds while the check runs.
const TICK_MS = 15_000

function useClock(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [on])
  return now
}

export function SafetyChip({ view, open, onToggle }: { view: SafetyView; open: boolean; onToggle: () => void }) {
  const now = useClock(view.state === 'running' && view.startedAt !== null)
  const minutes = view.state === 'running' ? safetyMinutes(view.startedAt, now) : null
  let label
  if (view.state === 'running') {
    label = (
      <>
        <Ring p={view.total > 0 ? view.n / view.total : 0} size={18} width={3} />
        Safety check, {view.n} of {view.total}
        {minutes && <span className="mins">· {minutes}</span>}
      </>
    )
  } else if (view.state === 'passed') {
    label = (
      <>
        <span className="okdot">
          <CheckIcon />
        </span>
        Safety check passed
      </>
    )
  } else if (view.state === 'unfinished') {
    // Stopped part way, with no verdict: muted, not red.
    label = (
      <>
        <span className="mutedot">
          <i />
        </span>
        Safety check didn’t finish
      </>
    )
  } else {
    label = (
      <>
        <span className="baddot">
          <i />
        </span>
        Safety check didn’t pass
      </>
    )
  }
  return (
    <button className={view.state === 'failed' ? 'chip cnew bad' : 'chip cnew'} aria-haspopup="dialog" aria-expanded={open} aria-label={`${chipText(view)}${minutes ? `, ${minutes} so far` : ''}. Show what it checks.`} onClick={onToggle}>
      {label}
    </button>
  )
}

const chipText = (view: SafetyView) =>
  view.state === 'running'
    ? `Safety check, ${view.n} of ${view.total}`
    : view.state === 'passed'
      ? 'Safety check passed'
      : view.state === 'unfinished'
        ? 'Safety check didn’t finish'
        : 'Safety check didn’t pass'

export interface SafetyPopoverProps {
  view: SafetyView
  tool: ToolText
  onRetry: () => void
  onClose: () => void
  // Stop the check: the call in progress ends, then it stops (cancel_safety_check). Without it,
  // the popover offers no stop.
  onStop?: () => void
}

export function SafetyPopover({ view, tool, onRetry, onClose, onStop }: SafetyPopoverProps) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  // A click anywhere else, or Esc, closes it. The chip toggles it by itself.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const target = e.target as Node
      if (box.current?.contains(target) || (target instanceof Element && target.closest('.chip'))) return
      close.current()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [])

  const passed = view.state === 'passed' ? SAFETY_CHECKS.length : view.state === 'running' ? checksPassed(view.n) : -1
  return (
    <div className="popv" role="dialog" aria-label="Safety check details" ref={box}>
      <h4>{chipText(view)}</h4>
      <p>Tearsheet sends {tool.short} 25 short test requests and makes sure that:</p>
      <ul>
        {SAFETY_CHECKS.map(([text], k) => {
          const done = k < passed
          const now = view.state === 'running' && k === passed
          return (
            <li key={k} className={done || now ? undefined : 'w'}>
              {done ? <CheckIcon /> : now ? <Spinner /> : <span />}
              <span>{checkText(text, tool)}</span>
            </li>
          )
        })}
      </ul>
      {view.state === 'failed' ? (
        <>
          <p className="last bad">{view.reason}</p>
          <p>Tearsheet won’t use {tool.name} for reports until the check passes.</p>
          <div className="row">
            <button className="btn2" onClick={onRetry}>
              Run the check again
            </button>
          </div>
        </>
      ) : view.state === 'unfinished' ? (
        <>
          <p className="last">{view.reason}</p>
          <p>It runs again by itself before {tool.name}’s next report, or you can run it now.</p>
          <div className="row">
            <button className="btn2" onClick={onRetry}>
              Run the check again
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="last">About 3 minutes, and a small part of one usage window. It runs again by itself whenever {tool.name} updates.</p>
          {view.state === 'running' && onStop && (
            <div className="row">
              {view.stopping ? (
                <span className="stopping">
                  <Spinner />
                  Stopping after this call
                </span>
              ) : (
                <button className="btn2" onClick={onStop}>
                  Stop the check
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
