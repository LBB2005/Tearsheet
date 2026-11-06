// The run view (the spec's "Pages → 2. New report"): it replaces the home page while a report is
// written. The 14-segment ring with the Glass mark filling in its middle, the five stages, and
// the step list. If the run stops (the plan's usage limit, a sign-out, the engine restarting), a
// red box shows the engine's message and the reset time, with Resume (or, when the safety check
// stopped it, the check). Cancel run sits in the toolbar (App.tsx), in the Chart button's place.
// The logic is in run.ts. Ported from docs/designs/opening-and-setup.html
// (S.run, segRing).

import './home.css'

import { REPORT_STEPS } from '../../shared/steps'
import { Mark } from '../mark/Mark'
import { at } from '../setup/parts'
import { markFill, runStep, stepStatus, TOTAL, type RunState } from './run'

export type { RunFailure, RunState } from './run'

// The engine's steps (shared/steps.ts) in the words the step list uses.
const LABELS: Record<(typeof REPORT_STEPS)[number], string> = {
  resolve: 'Find the company and its peers',
  fetch: 'Download filings, facts and prices',
  normalize: 'Standardize the financial statements',
  text: 'Split filings into sections and paragraphs',
  metrics: 'Compute the metrics',
  score: 'Score against the peer group',
  value: 'Value the company and each peer',
  rate: 'Rate: Buy, Hold or Sell',
  news: 'Find recent articles',
  extract: 'Read the sources for evidence',
  narrate: 'Write the sections',
  render: 'Fill in the numbers',
  verify: 'Check every claim',
  save: 'Save the report'
}

// The five stages, each over a run of steps: [name, first step, step after the last].
const STAGES: [string, number, number][] = [
  ['Data', 0, 4],
  ['Numbers', 4, 8],
  ['Evidence', 8, 10],
  ['Writing', 10, 12],
  ['Checks', 12, 14]
]

// 14 arcs around a 200 px ring, with small gaps, one per step.
function SegRing({ classes }: { classes: string[] }) {
  const c = 100
  const r = 88
  const gap = 3.4
  const point = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(c + r * Math.cos(a)).toFixed(1)} ${(c + r * Math.sin(a)).toFixed(1)}`
  }
  return (
    <svg className="seg" viewBox="0 0 200 200" aria-hidden="true">
      {REPORT_STEPS.map((step, j) => {
        const a0 = (j * 360) / TOTAL + gap / 2
        const a1 = ((j + 1) * 360) / TOTAL - gap / 2
        return <path key={step} className={classes[j]} d={`M${point(a0)} A${r} ${r} 0 0 1 ${point(a1)}`} />
      })}
    </svg>
  )
}

function resetTime(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime()) ? iso : when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export interface RunViewProps {
  run: RunState
  ready: boolean
  resuming: boolean
  // The AI tool's safety check now, for a run the check stopped: Resume only once it passes.
  safety: 'failed' | 'running' | 'ok'
  onResume: () => void
  onRecheck: () => void
}

export function RunView({ run, ready, resuming, safety, onResume, onRecheck }: RunViewProps) {
  const k = runStep(run, ready)
  const statuses = REPORT_STEPS.map((_, j) => stepStatus(run, ready, j))
  const failure = run.failure
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
  return (
    <div className="runv">
      <div className="segring mv" style={at(0)} role="img" aria-label={k === TOTAL ? 'All 14 steps done' : `Step ${k + 1} of ${TOTAL}`}>
        <SegRing classes={statuses.map((s) => s.cls)} />
        <div className="rc">
          <Mark size={44} fill={markFill(run, ready)} />
          <b>{Math.min(k + 1, TOTAL)}</b>
          <small>of {TOTAL}</small>
        </div>
      </div>
      <div className="runcol">
        {failure && (
          <div className="card alert mv" style={at(1)} role="alert">
            <div>
              <b>{title}</b>
              <span>{failure.message}</span>
              {failure.resetAt && <span>Your usage resets at {resetTime(failure.resetAt)}.</span>}
              {failure.fix && (
                <span>
                  Sign in again in Terminal: <code>{failure.fix}</code>
                </span>
              )}
              {lockedOut && safety !== 'ok' && <span>Resume comes back once the safety check passes.</span>}
              {run.reportId && <span>The report so far is saved, and opens from the sidebar.</span>}
            </div>
            {fix}
          </div>
        )}
        <div className="phases mv" style={at(failure ? 2 : 1)}>
          {STAGES.map(([name, a, b]) => (
            <span key={name} className={k >= b ? 'd' : k >= a ? 'now' : undefined}>
              {name}
            </span>
          ))}
        </div>
        <ol className="steps mv" style={at(failure ? 3 : 2)}>
          {REPORT_STEPS.map((step, j) => (
            <li key={step} className={statuses[j].cls} aria-current={statuses[j].cls === 'now' ? 'step' : undefined}>
              <span className="n2">{j + 1}</span>
              {LABELS[step]}
              <span className="s">{statuses[j].text}</span>
            </li>
          ))}
        </ol>
        {!failure && k < TOTAL && (
          <p className="fine mv" style={at(3)}>
            About 20 minutes the first time in a sector, mostly prices on the free plan. Keep using your Mac; Tearsheet tells you when it’s ready.
          </p>
        )}
      </div>
    </div>
  )
}
