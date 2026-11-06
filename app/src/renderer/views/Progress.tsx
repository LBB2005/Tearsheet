import { FanMark } from '../fan/FanMark'

export interface RunState {
  runId: string
  steps: Record<string, string>
  reportId: string | null
  failure: { message: string; code: string; resetAt?: string | null; fix?: string | null } | null
}

const STEPS: [string, string][] = [
  ['resolve', 'Find the company and its peers'],
  ['fetch', 'Download filings, facts and prices'],
  ['normalize', 'Standardize the financial statements'],
  ['text', 'Split filings into sections and paragraphs'],
  ['metrics', 'Compute the metrics'],
  ['score', 'Score against the peer group'],
  ['value', 'Value the company and each peer'],
  ['rate', 'Rate: Buy, Hold or Sell'],
  ['news', 'Find recent articles'],
  ['extract', 'Read the sources for evidence'],
  ['narrate', 'Write the sections'],
  ['render', 'Fill in the numbers'],
  ['verify', 'Check every claim'],
  ['save', 'Save the report']
]

export function Progress({ run, onResumed }: { run: RunState | null; onResumed: (runId: string) => void }) {
  if (!run) return <p className="muted">No report is running. Start one from New report.</p>
  const resume = async () => {
    const reply = await window.tearsheet.resume(run.runId)
    if (reply.ok && reply.result) onResumed(reply.result.run_id)
  }
  const cancel = () => void window.tearsheet.cancel(run.runId)
  const running = !run.reportId && !run.failure
  return (
    <section>
      <h2>Progress</h2>
      <FanMark mode="run" size={128} className="fm-progress" steps={run.steps} ready={Boolean(run.reportId)} failed={Boolean(run.failure)} />
      <p className="muted">Run {run.runId}</p>
      <ol className="steps">
        {STEPS.map(([key, label], i) => {
          const state = run.steps[key]
          const mark = state === 'done' ? '✓' : state === 'started' ? '…' : state === 'failed' ? '✕' : ' '
          return (
            <li key={key} className={state ?? ''}>
              {mark} {i + 1}. {label}
            </li>
          )
        })}
      </ol>
      {run.failure && (
        <div className="notice">
          <p className="error">{run.failure.message}</p>
          {run.failure.resetAt && <p>Your usage resets at {new Date(run.failure.resetAt).toLocaleString()}.</p>}
          {run.failure.fix && (
            <p>
              Sign in again in Terminal: <code>{run.failure.fix}</code>
            </p>
          )}
          <button className="primary" onClick={() => void resume()}>
            Resume
          </button>
        </div>
      )}
      {running && (
        <button className="plain" onClick={cancel}>
          Cancel
        </button>
      )}
    </section>
  )
}
