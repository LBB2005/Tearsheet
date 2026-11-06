// The run view (the spec's "Pages → 2. New report"): it replaces the home page while a report is
// written. The 14-segment ring with the Glass mark filling in its middle, the five stages, and
// the step list. If the run stops (the plan's usage limit, a sign-out, the engine restarting), a
// red box shows the engine's message and the reset time, with Resume. Cancel run sits in the
// toolbar (App.tsx), in the Chart button's place. Ported from docs/designs/opening-and-setup.html
// (S.run, segRing).

import './home.css'

import { REPORT_STEPS, stepsBehind, type StepStates } from '../../shared/steps'
import { fillForSteps } from '../mark/drawing'
import { Mark } from '../mark/Mark'
import { at } from '../setup/parts'

export interface RunFailure {
  message: string
  code: string
  resetAt?: string | null
  fix?: string | null
}

export interface RunState {
  runId: string
  // The company the engine resolved in step 1 (run_report's answer).
  ticker: string | null
  name: string | null
  steps: StepStates
  reportId: string | null
  failure: RunFailure | null
}

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

const TOTAL = REPORT_STEPS.length

// The step the run is on (0–13), or 14 once the report is ready.
export function runStep(run: RunState, ready: boolean): number {
  if (ready && run.reportId && !run.failure) return TOTAL
  return Math.min(stepsBehind(run.steps), TOTAL - 1)
}

// The toolbar's title and subtitle while the run view shows.
export function runTitle(run: RunState, ready: boolean): { title: string; subtitle: string } {
  const title = run.name ?? run.ticker ?? 'New report'
  const k = runStep(run, ready)
  if (k === TOTAL) return { title, subtitle: 'The report is ready' }
  if (run.failure) return { title, subtitle: `Stopped at step ${k + 1} of ${TOTAL}` }
  return { title, subtitle: `Writing the report, step ${k + 1} of ${TOTAL}` }
}

// 14 arcs around a 200 px ring, with small gaps: done, the one being worked on, or waiting.
function SegRing({ k, stopped }: { k: number; stopped: boolean }) {
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
        const cls = j < k ? 'd' : j === k ? (stopped ? 'x' : 'now') : 'w'
        return <path key={step} className={cls} d={`M${point(a0)} A${r} ${r} 0 0 1 ${point(a1)}`} />
      })}
    </svg>
  )
}

function resetTime(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime()) ? iso : when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function RunView({ run, ready, resuming, onResume }: { run: RunState; ready: boolean; resuming: boolean; onResume: () => void }) {
  const k = runStep(run, ready)
  const stopped = run.failure !== null
  const fill = k === TOTAL ? 1 : fillForSteps(run.steps)
  const status = (j: number): [string, string] => {
    const state = run.steps[REPORT_STEPS[j]]
    if (j < k) return ['d', state === 'skipped' ? 'Skipped' : 'Done']
    if (j === k) return stopped ? ['x', 'Stopped'] : ['now', state === 'retrying' ? 'Retrying' : 'Working']
    return ['w', '']
  }
  const failure = run.failure
  return (
    <div className="runv">
      <div className="segring mv" style={at(0)} role="img" aria-label={k === TOTAL ? 'All 14 steps done' : `Step ${k + 1} of ${TOTAL}`}>
        <SegRing k={k} stopped={stopped} />
        <div className="rc">
          <Mark size={44} fill={fill} />
          <b>{Math.min(k + 1, TOTAL)}</b>
          <small>of {TOTAL}</small>
        </div>
      </div>
      <div className="runcol">
        {failure && (
          <div className="card alert mv" style={at(1)} role="alert">
            <div>
              <b>{failure.code === 'USAGE_LIMIT' ? 'Your plan’s usage limit stopped the report' : 'The report stopped'}</b>
              <span>{failure.message}</span>
              {failure.resetAt && <span>Your usage resets at {resetTime(failure.resetAt)}.</span>}
              {failure.fix && (
                <span>
                  Sign in again in Terminal: <code>{failure.fix}</code>
                </span>
              )}
              {run.reportId && <span>The report so far is saved, and opens from the sidebar.</span>}
            </div>
            <button className="btn2" disabled={resuming} onClick={onResume}>
              {resuming ? 'Resuming…' : 'Resume'}
            </button>
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
          {REPORT_STEPS.map((step, j) => {
            const [cls, text] = status(j)
            return (
              <li key={step} className={cls} aria-current={cls === 'now' ? 'step' : undefined}>
                <span className="n2">{j + 1}</span>
                {LABELS[step]}
                <span className="s">{text}</span>
              </li>
            )
          })}
        </ol>
        {!stopped && k < TOTAL && (
          <p className="fine mv" style={at(3)}>
            About 20 minutes the first time in a sector, mostly prices on the free plan. Keep using your Mac; Tearsheet tells you when it’s ready.
          </p>
        )}
      </div>
    </div>
  )
}
