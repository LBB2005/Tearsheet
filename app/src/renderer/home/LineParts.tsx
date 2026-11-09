// The line's parts on screen (home/line.ts has the logic):
// - LinePlanCard, on the home page: the companies typed, checked by the engine before anything
//   starts, with which will be new official predictions and any left out, and Start.
// - LineStrip, under the run view's receipt: "Up next" while the line goes, each company with a ×
//   to take it out, Add a company and Cancel all; when the line is paused, how to go on; and once
//   the line is done, how each report went, each one opening from the list.
// - LinePaused, at the top of the home page: reports waiting in a paused line (left from when
//   Tearsheet closed, or behind a problem such as the plan's usage limit), to carry on or clear.
//   Behind a safety check that didn't pass, only the check again or Cancel all.
// - LineWaiting, in the same place: reports waiting for the safety check under way, before any
//   report has been written (first-run design §5).

import type { LineItem, LinePlan, LineState } from '../../shared/protocol'
import { at } from '../setup/parts'
import { doneCount, joinNames, lineTime, linePlace, officialNote, outcomeText, plural, REOPENED, SAFETY_PAUSES, safetyPause, safetyPauseText } from './line'

export function LinePlanCard({ plan, starting, onStart, onCancel }: { plan: LinePlan; starting: boolean; onStart: () => void; onCancel: () => void }) {
  const n = plan.items.length
  return (
    <div className="card lineplan mv" style={at(0)} role="group" aria-label="Several reports">
      {n > 0 ? (
        <>
          <b>Write {plural(n, 'report', 'reports')}, one after another?</b>
          <span className="tk">{plan.items.map((item) => item.ticker).join(' · ')}</span>
          <span>
            {sentence(lineTime(n))}
            {n > 1 ? ' in all' : ''}. Keep your Mac open; Tearsheet keeps it awake until {n > 1 ? 'they’re' : 'it’s'} done.
          </span>
          <span>{officialNote(plan.items)}</span>
        </>
      ) : (
        <b>None of these can be written</b>
      )}
      {plan.skipped.length > 0 && (
        <ul className="left" aria-label="Left out">
          {plan.skipped.map((skip) => (
            <li key={skip.query}>
              <b>{skip.query}</b> {skip.reason}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {n > 0 && (
          <button className="btn2 primary2" disabled={starting} onClick={onStart}>
            {starting ? 'Starting…' : n === 1 ? 'Start the report' : `Start ${n} reports`}
          </button>
        )}
        <button className="btn2" disabled={starting} onClick={onCancel}>
          {n > 0 ? 'Cancel' : 'Change the list'}
        </button>
      </div>
    </div>
  )
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export interface LineStripProps {
  line: LineState
  // The run the view shows, so a finished line's list shows only under one of its own reports.
  runId: string
  // One report's usual time, in seconds, for the time the rest will take.
  perReport: number
  onRemove: (ticker: string) => void
  onAdd: () => void
  onCancelAll: () => void
  onCarryOn: () => void
  onOpen: (reportId: string) => void
  // Behind a stopped or unfinished safety check: run it again.
  onRecheck?: () => void
}

export function LineStrip({ line, runId, perReport, onRemove, onAdd, onCancelAll, onCarryOn, onOpen, onRecheck }: LineStripProps) {
  const ours = line.writing?.run_id === runId || line.finished.some((item) => item.run_id === runId)
  const paused = line.paused !== null && line.paused.code !== REOPENED
  // A safety pause: carrying on would skip the full check. A stopped or unfinished check paused
  // no report of its own, so it says why and offers the check; a failed one's run has its box.
  const safe = paused && safetyPause(line.paused?.code)
  const checkPause = paused && SAFETY_PAUSES.has(line.paused?.code ?? '')
  const going = line.writing !== null || line.waiting.length > 0
  if (going || paused) {
    const n = line.waiting.length
    // Nothing waiting: the red box's Resume, or the receipt, says it all.
    if ((!ours || paused) && n === 0) return null
    const place = linePlace(line)
    return (
      <section className="card linestrip mv" style={at(1)} aria-label="Up next">
        <div className="lh">
          <b>{line.writing && place.total > 1 ? `Report ${place.at} of ${place.total}` : 'Up next'}</b>
          {n > 0 && !paused && (
            <span>
              {lineTime(n, perReport)} for the {n === 1 ? 'one' : n} after this
            </span>
          )}
        </div>
        {paused && (
          <p className="why">
            {checkPause && line.paused ? safetyPauseText(line.paused.code, line.paused.message) : `The line is paused. Resume carries on with this report, then the ${n === 1 ? 'one' : n} waiting.`}
          </p>
        )}
        {n > 0 ? (
          <ul className="chips" aria-label="Waiting">
            {line.waiting.map((item) => (
              <li key={item.ticker} title={item.name}>
                <b>{item.ticker}</b>
                <button aria-label={`Take ${item.ticker} out of the line`} onClick={() => onRemove(item.ticker)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="last">This is the last one.</span>
        )}
        <div className="row">
          {!paused && line.waiting.length < line.limit && (
            <button className="btn2" onClick={onAdd}>
              Add a company
            </button>
          )}
          {checkPause && onRecheck && (
            <button className="btn2" onClick={onRecheck}>
              Run it again
            </button>
          )}
          {paused && !safe && n > 0 && (
            <button className="btn2" onClick={onCarryOn}>
              Skip it and carry on
            </button>
          )}
          <button className="btn2" onClick={onCancelAll}>
            Cancel all
          </button>
        </div>
      </section>
    )
  }
  if (!ours || line.finished.length < 2) return null
  return (
    <section className="card linestrip mv" style={at(2)} aria-label="This line">
      <div className="lh">
        <b>{plural(line.finished.length, 'report', 'reports')} in this line</b>
        <span>{doneCount(line.finished)}</span>
      </div>
      <ul className="done" aria-label="How each went">
        {line.finished.map((item) => (
          <DoneRow key={item.run_id ?? item.ticker} item={item} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  )
}

function DoneRow({ item, onOpen }: { item: LineItem; onOpen: (reportId: string) => void }) {
  const tone = item.outcome === 'ready' ? 'ok' : item.outcome === 'cancelled' ? 'muted' : 'bad'
  return (
    <li>
      <i className={tone} aria-hidden="true" />
      <b>{item.ticker}</b>
      <span title={item.message ?? undefined}>{outcomeText(item)}</span>
      {item.report_id && (
        <button className="btn2" aria-label={`Open the ${item.ticker} report`} onClick={() => onOpen(item.report_id as string)}>
          Open
        </button>
      )}
    </li>
  )
}

export interface LinePausedProps {
  line: LineState
  onCarryOn: () => void
  onClear: () => void
  // Behind a safety check that didn't pass (line.ts safetyPause): the full check again, and the
  // line's Cancel all. Carry on is hidden, since it would skip the check.
  onRecheck: () => void
  onCancelAll: () => void
  // A check runs now, so Run it again waits for it.
  checking?: boolean
  // This session's reason for a failed check, said in place of the engine's message.
  checkReason?: string | null
  // The writing tool's check has passed since a LOCKDOWN_FAILED pause: going on is safe again,
  // as it was before (the paused report's Resume, or Carry on).
  checkPassed?: boolean
}

export function LinePaused({ line, onCarryOn, onClear, onRecheck, onCancelAll, checking = false, checkReason = null, checkPassed = false }: LinePausedProps) {
  const names = line.waiting.map((item) => item.ticker)
  const reopened = line.paused?.code === REOPENED
  const pause = line.paused
  if (pause && safetyPause(pause.code) && !(pause.code === 'LOCKDOWN_FAILED' && checkPassed)) {
    return (
      <div className={pause.code === 'LOCKDOWN_FAILED' ? 'card alert mv' : 'card alert note mv'} style={at(0)} role="status">
        <div>
          <b>The line is paused</b>
          <span>
            {safetyPauseText(pause.code, pause.message, checkReason)} {joinNames(names)} {names.length === 1 ? 'is' : 'are'} waiting.
          </span>
        </div>
        <button className="btn2" disabled={checking} onClick={onRecheck}>
          {checking ? 'Checking…' : 'Run it again'}
        </button>
        <button className="btn2" onClick={onCancelAll}>
          Cancel all
        </button>
      </div>
    )
  }
  return (
    <div className="card alert note mv" style={at(0)} role="status">
      <div>
        <b>{reopened ? `${plural(names.length, 'report was', 'reports were')} waiting when Tearsheet closed` : 'The line is paused'}</b>
        {reopened ? (
          <span>{joinNames(names)}. Carry on writing them one after another, or clear the line.</span>
        ) : (
          <span>
            {line.paused?.message} {joinNames(names)} {names.length === 1 ? 'is' : 'are'} waiting. Carry on with {names.length === 1 ? 'it' : 'them'}, or clear the line.
          </span>
        )}
      </div>
      <button className="btn2" onClick={onCarryOn}>
        Carry on
      </button>
      <button className="btn2" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

// Reports waiting for the safety check under way, before any report runs: they start once it
// passes (first-run design §5, CUJ 6).
export function LineWaiting({ line, n, total }: { line: LineState; n: number; total: number }) {
  const names = line.waiting.map((item) => item.ticker)
  return (
    <div className="card alert note mv" style={at(0)} role="status" aria-label="Waiting for the safety check">
      <div>
        <b>
          {joinNames(names)} {names.length === 1 ? 'is' : 'are'} in the line
        </b>
        <span>
          Starts when the safety check finishes ({n} of {total}).
        </span>
      </div>
    </div>
  )
}
