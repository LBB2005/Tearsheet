// The run view: the home page's place while a report is written. Liam's pick of the ten
// loading screens (7 Nov 2026), "Receipt": a card that writes down what each of the five
// stages has done as it happens, with the calls under way and their bars, how long each stage
// took, the time so far and about how long is left (paced by time, shared/pace.ts). When the
// report is ready it waits on a Done card until Open the report. If the run stops (the plan's
// usage limit, a sign-out, the engine restarting), a red box shows the engine's message and the
// reset time, with Resume (or, when the safety check stopped it, the check). Cancel run sits in
// the toolbar (App.tsx). Under the receipt, the line's strip says what is up next. Its only motion is the working stage's small spinner and the bars
// sliding, none of it under Reduce motion (styles.css). The logic is in run.ts.

import './home.css'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { about, clock, leftText, pace, usualTimes } from '../../shared/pace'
import { REPORT_STEPS } from '../../shared/steps'
import { at } from '../setup/parts'
import type { ToolKind } from '../../shared/tools'
import { SignInAgain } from './fix'
import { doneFacts, liveRows, runStep, stageLine, stageMark, stageTime, STAGES, TOTAL, type RunState } from './run'

export type { RunFailure, RunState } from './run'

function resetTime(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime()) ? iso : when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

const timeOfDay = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const pct = (f: number) => `${(Math.min(1, Math.max(0, f)) * 100).toFixed(1)}%`

// The clock, once a second while the run goes.
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [on])
  return on ? now : Date.now()
}

export interface RunViewProps {
  run: RunState
  ready: boolean
  resuming: boolean
  // The AI tool's safety check now, for a run the check stopped: Resume only once it passes.
  safety: 'failed' | 'running' | 'ok'
  // The writing tool, for a run a sign-out stopped: Sign in again, as on the home page.
  tool: ToolKind
  // "The button is on": Sign in again runs inside Tearsheet; off, it copies the paste command.
  buttonOn: boolean
  onResume: () => void
  onRecheck: () => void
  onOpen: () => void
  // The line's strip (home/LineParts.tsx): what is up next, or how each of its reports went.
  strip?: ReactNode
  // The line waits for the plan's usage limit to reset and then resumes this report by itself:
  // what it waits for, in a sentence (home/line.ts's waitText).
  waiting?: string
}

export function RunView({ run, ready, resuming, safety, tool, buttonOn, onResume, onRecheck, onOpen, strip, waiting }: RunViewProps) {
  const done = runStep(run, ready) === TOTAL
  const failure = run.failure
  const now = useNow(!done && !failure)
  const open = useRef<HTMLButtonElement>(null)
  // The Done card's button takes the keyboard, so Return opens the report.
  useEffect(() => {
    if (done) open.current?.focus()
  }, [done])

  const lockedOut = failure?.code === 'LOCKDOWN_FAILED'
  let fix = (
    <button className="btn2" disabled={resuming} onClick={onResume}>
      {resuming ? 'Resuming…' : 'Resume'}
    </button>
  )
  if (lockedOut && safety === 'failed')
    fix = (
      <button className="btn2" onClick={onRecheck}>
        Run the check again
      </button>
    )
  else if (lockedOut && safety === 'running')
    fix = (
      <button className="btn2" disabled>
        Checking…
      </button>
    )
  const title = failure?.code === 'USAGE_LIMIT' ? 'Your plan’s usage limit stopped the report' : lockedOut ? 'The safety check stopped the report' : 'The report stopped'

  const { progress, left } = pace(run.steps, run.times, run.tally, now, run.seen)
  const rows = liveRows(run, ready, now)
  const companies = run.tally?.companies
  const facts = doneFacts(run)
  const usualTable = usualTimes(run.tally)
  const usual = REPORT_STEPS.reduce((sum, step) => sum + usualTable[step], 0)
  const rating = run.tally?.rating?.toLowerCase()
  return (
    <div className="runv">
      {failure && (
        <div className="card alert mv" style={at(0)} role="alert">
          <div>
            <b>{title}</b>
            <span>{failure.message}</span>
            {failure.resetAt && !waiting && <span>Your usage resets at {resetTime(failure.resetAt)}.</span>}
            {waiting && <span>{waiting} Or resume it now.</span>}
            {failure.fix && <SignInAgain kind={tool} buttonOn={buttonOn} />}
            {lockedOut && safety !== 'ok' && <span>Resume comes back once the safety check passes.</span>}
            {run.reportId && <span>The report so far is saved, and opens from the sidebar.</span>}
          </div>
          {fix}
        </div>
      )}
      <section className="rcpt mv" style={at(failure ? 1 : 0)} aria-label="Report progress">
        <header className="rh">
          <div>
            <b>{run.name ?? run.ticker ?? 'New report'}</b>
            <span>{[run.ticker, companies ? `${companies - 1} peers` : null].filter(Boolean).join(' · ')}</span>
          </div>
          <time>{done && run.readyAt ? `finished at ${timeOfDay(run.readyAt)}` : `started ${timeOfDay(run.startedAt)}`}</time>
        </header>
        <ol>
          {STAGES.map((stage, k) => {
            const mark = stageMark(run, ready, k)
            return (
              <li key={stage.name} className={mark} aria-current={mark === 'now' ? 'step' : undefined}>
                <div className="ln">
                  <i className="ck" aria-hidden="true" />
                  <b>{stage.name}</b>
                  <span className="lead" aria-hidden="true" />
                  <span className="tm">{mark === 'x' ? 'Stopped' : stageTime(run, ready, k, now)}</span>
                </div>
                <p className="dt">{stageLine(run, ready, k)}</p>
                {mark === 'now' && rows.length > 0 && (
                  <ul className="live">
                    {rows.map((row) => (
                      <li key={row.name}>
                        <span>{row.name}</span>
                        {row.frac !== null && <i style={{ ['--w' as string]: pct(row.frac) }} />}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
        {done ? (
          <div className="donec">
            <div>
              <b>Done in {facts.took}</b>
              {facts.claims && <span>{facts.claims}</span>}
            </div>
            {facts.rating && <em className={rating ? `pill ${rating}` : 'pill'}>{facts.rating}</em>}
            <button ref={open} className="btn2 primary2" onClick={onOpen}>
              Open the report
            </button>
          </div>
        ) : (
          !failure && (
            <footer className="ft">
              <div className="bar" role="progressbar" aria-label="How far the report has got" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <i style={{ width: pct(progress) }} />
              </div>
              <div className="fr">
                <span>{clock(now - run.startedAt)} elapsed</span>
                <span>{leftText(left)}</span>
              </div>
            </footer>
          )
        )}
      </section>
      {strip}
      {!failure && !done && (
        <p className="fine mv" style={at(1)}>
          Usually {about(usual)}. Keep using your Mac; Tearsheet tells you when it’s ready.
        </p>
      )}
    </div>
  )
}
