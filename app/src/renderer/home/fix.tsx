// "Sign in again", Install and Update outside setup (first-run design item 39): the home page's
// and the run view's "Sign in again", and each row on Settings → AI tools. When the button is on
// they run the Install button's steps inside Tearsheet (install), and show its progress words in
// place; when it is off, they copy the paste command and open Terminal (home/paste.tsx). Either
// way the window only names the tool: the main process builds and runs every command.
//
// While a run waits in the browser: "Browser didn't open? Open the sign-in page" at 15 seconds,
// and the paste command at 2 minutes, which stops the in-app sign-in first. A failure says why,
// with Try again and the paste command, so there is always a next step.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import type { InstallProgress, RunResult } from '../../shared/install'
import type { ToolKind } from '../../shared/tools'
import { Spinner } from '../setup/parts'
import { progressWords, WORDS } from '../setup/words'
import { useWaiting } from '../shell/waiting'
import { PasteSteps, usePaste, type PasteFor } from './paste'

export interface InstallRun {
  kinds: ToolKind[]
  progress: InstallProgress[]
  // install()'s answer, once the run has ended.
  result: RunResult | null
}

// One Install button run at a time, with the install_progress messages for its tools.
export function useInstallRun(): { run: InstallRun | null; start: (kinds: ToolKind[]) => void; reset: () => void } {
  const [run, setRun] = useState<InstallRun | null>(null)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    const off = window.tearsheet.onNotification((note) => {
      if (note.method !== 'install_progress') return
      const p = note.params as unknown as InstallProgress
      setRun((r) => (r && !r.result && r.kinds.includes(p.tool) ? { ...r, progress: [...r.progress, p] } : r))
    })
    return () => {
      live.current = false
      off()
    }
  }, [])
  const start = useCallback((kinds: ToolKind[]) => {
    setRun({ kinds, progress: [], result: null })
    void window.tearsheet.install(kinds).then(
      (result) => live.current && setRun((r) => (r ? { ...r, result } : r)),
      () => live.current && setRun((r) => (r ? { ...r, result: { outcome: 'failed' } } : r))
    )
  }, [])
  const reset = useCallback(() => setRun(null), [])
  return { run, start, reset }
}

export interface Fix {
  // Starts the fix: the Install button's steps, or the paste command.
  start: () => void
  // Something is under way or has something to say, so the caller hides its own button.
  active: boolean
  // The progress, the fallbacks and the failure, for the caller to place.
  below: ReactNode
  reset: () => void
}

// The fix for one tool: `purpose` says which steps the main process will pick (it decides from
// the tool's status; the window never says what to run).
export function useFix(kind: ToolKind, buttonOn: boolean, purpose: PasteFor, buttonClass = 'btn2'): Fix {
  const paste = usePaste(kind)
  const button = useInstallRun()
  const [refused, setRefused] = useState(false)
  const { run } = button
  const running = run !== null && run.result === null
  useWaiting(running)
  useEffect(() => {
    if (run?.result?.outcome === 'refused') setRefused(true)
  }, [run?.result?.outcome])

  const toPaste = () => {
    // Two sign-ins of one tool never run at once: the in-app one stops first.
    const stop = running ? window.tearsheet.cancelInstall().catch(() => false) : Promise.resolve(true)
    void stop.then(() => {
      button.reset()
      void paste.start()
    })
  }
  const useButton = buttonOn && !refused
  const start = () => {
    if (useButton) button.start([kind])
    else void paste.start()
  }
  const reset = () => {
    button.reset()
    paste.reset()
  }

  let below: ReactNode = null
  if (paste.state) below = <PasteSteps state={paste.state} kind={kind} purpose={purpose} onAgain={() => void paste.start()} buttonClass={buttonClass} />
  else if (run) {
    const last = run.progress[run.progress.length - 1]
    const outcome = run.result?.outcome
    const failedNote = last && (last.status === 'failed' || last.status === 'blocked') ? last : null
    if (outcome === 'refused') {
      below = (
        <div className="signin">
          <span>{WORDS.refused}</span>
          <div className="row">
            <button className={buttonClass} onClick={toPaste}>
              {WORDS.copyOpen}
            </button>
          </div>
        </div>
      )
    } else if (failedNote || outcome === 'failed' || outcome === 'blocked') {
      below = (
        <div className="signin">
          <span className="bad" role="alert">
            {failedNote ? progressWords(failedNote) : progressWords({ tool: kind, step: 'signIn', status: 'failed' })}
          </span>
          <div className="row">
            <button className={buttonClass} onClick={start}>
              {WORDS.tryAgain}
            </button>
            <button className={buttonClass} onClick={toPaste}>
              {WORDS.copyOpen}
            </button>
          </div>
        </div>
      )
    } else if (running) {
      const wait = last?.step === 'signIn' ? last.status : null
      below = (
        <div className="signin">
          <span className="st" aria-live="polite">
            <Spinner />
            {last ? progressWords(last) : 'Starting…'}
          </span>
          {(wait === 'slow' || wait === 'stuck') && (
            <div className="row">
              <button className="lk" onClick={() => void window.tearsheet.openSignInPage()}>
                {WORDS.openSignIn}
              </button>
            </div>
          )}
          {wait === 'stuck' && (
            <div className="row">
              <span>{WORDS.stuck}</span>
              <button className={buttonClass} onClick={toPaste}>
                {WORDS.copyOpen}
              </button>
            </div>
          )}
        </div>
      )
    } else if (last) {
      below = (
        <div className="signin">
          <span className="st">{progressWords(last)}</span>
          {outcome === 'cancelled' && (
            <div className="row">
              <button className={buttonClass} onClick={start}>
                {WORDS.tryAgain}
              </button>
            </div>
          )}
        </div>
      )
    }
  }
  return { start, active: below !== null, below, reset }
}

// "Sign in again", then its steps in its place: the run view's red box, for a run a sign-out
// stopped.
export function SignInAgain({ kind, buttonOn }: { kind: ToolKind; buttonOn: boolean }) {
  const fix = useFix(kind, buttonOn, 'signIn')
  if (fix.active) return <>{fix.below}</>
  return (
    <div className="row">
      <button className="btn2" onClick={fix.start}>
        Sign in again
      </button>
    </div>
  )
}
