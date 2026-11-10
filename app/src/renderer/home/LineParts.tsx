// The line's parts on screen (home/line.ts has the logic):
// - LinePlanCard, on the home page and under the strip: the companies typed or picked, checked by
//   the engine before anything starts, with the time and AI calls they take, how many will be new
//   official predictions, which were left out and why (grouped), the 30-day skip, and Start.
// - QuickAdd: one click for the whole S&P 500, one sector, or the rest (every company without a
//   finished report yet), each checked the same way before anything starts.
// - LineStrip, under the run view's receipt: "Up next" while the line goes, with "37 of 212 done,
//   about 12 hours left", each company with a × to take it out (folded past a dozen), Add a
//   company and Cancel all; when the line is paused, what it waits for and how to go on; and once
//   the line is done, how each report went, each one opening from the list.
// - LinePaused, at the top of the home page: reports waiting in a paused line (left from when
//   Tearsheet closed, behind a problem such as a sign-out, or waiting for the plan's usage to
//   reset), to carry on or clear. Behind a safety check that didn't pass, only the check again
//   or Cancel all.
// - LineWaiting, in the same place: reports waiting for the safety check under way, before any
//   report has been written (first-run design §5).

import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { LineGroups, LineItem, LinePlan, LineState } from '../../shared/protocol'
import { at } from '../setup/parts'
import { ConfirmButton } from './Confirm'
import {
  callsPerReportOf,
  doneCount,
  joinNames,
  lineCost,
  linePlace,
  lineProgress,
  officialNote,
  officialWarning,
  outcomeText,
  perReportOf,
  plural,
  REOPENED,
  SAFETY_PAUSES,
  safetyPause,
  safetyPauseText,
  skipGroups,
  someNames,
  USAGE_WEEK,
  waitsByItself,
  waitText,
  type PlanAsk
} from './line'

// A line this long or longer is a big run: the plan card says it in counts, with the warning.
const BIG = 10
// Tickers and companies shown before "Show all".
const FOLD_TICKERS = 24
const FOLD_CHIPS = 12
const FOLD_DONE = 8
const FOLD_SKIPS = 8

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// "Show all 212" / "Show fewer", for a folded list.
function Fold({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
  return (
    <button className="fold" aria-expanded={open} onClick={onToggle}>
      {open ? 'Show fewer' : `Show all ${total.toLocaleString('en-US')}`}
    </button>
  )
}

export interface LinePlanCardProps {
  plan: LinePlan
  starting: boolean
  // The 30-day skip, on by default; the card asks again when it changes.
  skipRecent?: boolean
  onSkipRecent?: (on: boolean) => void
  // One report's usual time (s), when the run view knows it better than the line does.
  perReport?: number
  onStart: () => void
  onCancel: () => void
}

export function LinePlanCard({ plan, starting, skipRecent, onSkipRecent, perReport, onStart, onCancel }: LinePlanCardProps) {
  const [allTickers, setAllTickers] = useState(false)
  const n = plan.items.length
  const big = n >= BIG
  const each = perReportOf(plan.line, perReport)
  const calls = callsPerReportOf(plan.line)
  const tickers = plan.items.map((item) => item.ticker)
  const shown = allTickers ? tickers : tickers.slice(0, FOLD_TICKERS)
  const repeat = plan.items.filter((item) => !item.official).length
  const groups = skipGroups(plan.skipped)
  const recent = groups.find((g) => g.kind === 'recent')?.skips.length ?? 0
  return (
    <div className="card lineplan mv" style={at(0)} role="group" aria-label="Several reports">
      {n > 0 ? (
        <>
          <b>{n === 1 ? `Write the ${tickers[0]} report?` : `Write ${plural(n, 'report', 'reports')}, one after another?`}</b>
          <span className="tk">
            {shown.join(' · ')}
            {tickers.length > FOLD_TICKERS && !allTickers ? ' …' : ''}
          </span>
          {tickers.length > FOLD_TICKERS && <Fold open={allTickers} total={tickers.length} onToggle={() => setAllTickers((on) => !on)} />}
          <span>
            {sentence(n > 1 ? lineCost(n, each, calls) : lineCost(1, each, calls))}
            {n > 1 ? ' in all' : ''}. Keep your Mac open; Tearsheet keeps it awake until {n > 1 ? 'they’re' : 'it’s'} done.
          </span>
          {big && <span>If your plan’s usage runs low, the line waits for it to reset and carries on by itself. Past 80% of your weekly usage, it asks you first.</span>}
          {big ? (
            <span className="warn" role="note">
              {officialWarning(plan.items) || 'None will be a new official prediction: each was rated in the last 30 days.'}
              {repeat > 0 && officialWarning(plan.items) ? ` ${plural(repeat, 'company was', 'companies were')} rated in the last 30 days, so ${repeat === 1 ? 'it won’t be' : 'they won’t be'}.` : ''}
            </span>
          ) : (
            <span>{officialNote(plan.items)}</span>
          )}
        </>
      ) : (
        <b>None of these can be written</b>
      )}
      {onSkipRecent && (
        <label className="skip">
          <input type="checkbox" checked={skipRecent ?? true} disabled={starting} onChange={(e) => onSkipRecent(e.target.checked)} />
          Skip companies with a report from the last 30 days
          {recent > 0 && <em>{plural(recent, 'skipped', 'skipped')}</em>}
        </label>
      )}
      {groups.length > 0 && (
        <div className="left" role="group" aria-label="Left out">
          {groups.map((group) => (
            <SkipList key={group.kind} head={group.head} skips={group.skips} detailed={group.kind === 'unknown'} />
          ))}
        </div>
      )}
      <div className="row">
        {n > 0 && (
          <button className="btn2 primary2" disabled={starting} onClick={onStart}>
            {starting ? 'Starting…' : n === 1 ? 'Start the report' : `Start ${n.toLocaleString('en-US')} reports`}
          </button>
        )}
        <button className="btn2" disabled={starting} onClick={onCancel}>
          {n > 0 ? 'Cancel' : 'Change the list'}
        </button>
      </div>
    </div>
  )
}

// One group of companies left out: its heading, then each with its reason (not found) or just
// the tickers (the rest), folded past a few.
function SkipList({ head, skips, detailed }: { head: string; skips: LinePlan['skipped']; detailed: boolean }) {
  const [open, setOpen] = useState(false)
  const shown = open ? skips : skips.slice(0, FOLD_SKIPS)
  return (
    <div className="skips">
      <b>{head}</b>
      {detailed ? (
        <ul>
          {shown.map((skip, i) => (
            <li key={`${skip.query}-${i}`}>
              <b>{skip.query}</b> {skip.reason}
            </li>
          ))}
        </ul>
      ) : (
        <span className="tk">{shown.map((skip) => skip.query).join(' · ')}</span>
      )}
      {skips.length > FOLD_SKIPS && <Fold open={open} total={skips.length} onToggle={() => setOpen((on) => !on)} />}
    </div>
  )
}

// The quick adds: the whole S&P 500, one sector, or the rest. Each asks the engine for its plan;
// nothing starts until the plan card's Start.
export function QuickAdd({ onAsk, disabled }: { onAsk: (ask: PlanAsk) => void; disabled?: boolean }) {
  const [groups, setGroups] = useState<LineGroups | null>(null)
  useEffect(() => {
    let live = true
    void window.tearsheet.lineGroups().then((r) => live && r.ok && r.result && setGroups(r.result))
    return () => {
      live = false
    }
  }, [])
  if (!groups) return null
  const rest = groups.rest > 0 && groups.rest < groups.all
  return (
    <div className="quickadd" role="group" aria-label="Add a group">
      <span>Or add</span>
      <button className="sg" disabled={disabled} onClick={() => onAsk({ group: 'all' })}>
        All S&amp;P 500 <em>{groups.all}</em>
      </button>
      <span className="sgw">
        <select
          className="sg"
          aria-label="Add a sector"
          disabled={disabled}
          value=""
          onChange={(e) => {
            if (e.target.value) onAsk({ group: 'sector', sector: e.target.value })
          }}
        >
          <option value="">A sector…</option>
          {groups.sectors.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.count})
            </option>
          ))}
        </select>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
        </svg>
      </span>
      {rest && (
        <button className="sg" disabled={disabled} title="Every S&P 500 company without a finished report yet" onClick={() => onAsk({ group: 'rest' })}>
          The rest <em>{groups.rest}</em>
        </button>
      )}
    </div>
  )
}

// Asking the engine for a line's plan: the companies typed or a quick add, with the 30-day skip
// (on by default). Only the newest answer counts; changing the skip asks again.
export function useLinePlan() {
  const [plan, setPlan] = useState<LinePlan | null>(null)
  const [asked, setAsked] = useState<PlanAsk | null>(null)
  const [skipRecent, setSkipRecent] = useState(true)
  const [checking, setChecking] = useState(false)
  const latest = useRef(0)

  const ask = async (request: PlanAsk, skip: boolean = skipRecent): Promise<string | null> => {
    const mine = ++latest.current
    setChecking(true)
    setAsked(request)
    const reply = await window.tearsheet.planLine(request.queries ?? [], { group: request.group, sector: request.sector, skipRecent: skip })
    if (mine !== latest.current) return null
    setChecking(false)
    if (reply.ok && reply.result) {
      setPlan(reply.result)
      return null
    }
    setPlan(null)
    return reply.error?.message || 'The companies couldn’t be checked.'
  }

  const changeSkip = (on: boolean) => {
    setSkipRecent(on)
    if (asked) void ask(asked, on)
  }

  const clear = () => {
    latest.current++
    setChecking(false)
    setPlan(null)
    setAsked(null)
  }

  return { plan, checking, skipRecent, ask, changeSkip, clear }
}

// The quick adds under the strip, to add a group while the line goes: the plan card opens
// there, and Start adds its companies behind the ones waiting.
export function LineAdder({ perReport, onAdd }: { perReport: number; onAdd: (tickers: string[]) => Promise<string | null> }) {
  const linePlan = useLinePlan()
  const [adding, setAdding] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const { plan } = linePlan
  return (
    <>
      {!plan && (
        <QuickAdd
          disabled={linePlan.checking || adding}
          onAsk={(ask) => {
            setWhy(null)
            void linePlan.ask(ask).then(setWhy)
          }}
        />
      )}
      {linePlan.checking && <span className="last">Checking…</span>}
      {plan && (
        <LinePlanCard
          plan={plan}
          starting={adding}
          skipRecent={linePlan.skipRecent}
          onSkipRecent={linePlan.changeSkip}
          perReport={perReport}
          onStart={() => {
            setAdding(true)
            void onAdd(plan.items.map((item) => item.ticker)).then((problem) => {
              setAdding(false)
              linePlan.clear()
              setWhy(problem)
            })
          }}
          onCancel={linePlan.clear}
        />
      )}
      {why && (
        <p className="why" role="alert">
          {why}
        </p>
      )}
    </>
  )
}

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
  // The quick adds and their plan card, to add more while the line goes.
  adder?: ReactNode
  // Behind a stopped or unfinished safety check: run it again.
  onRecheck?: () => void
}

export function LineStrip({ line, runId, perReport, onRemove, onAdd, onCancelAll, onCarryOn, onOpen, adder, onRecheck }: LineStripProps) {
  const [allChips, setAllChips] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const ours = line.writing?.run_id === runId || line.finished.some((item) => item.run_id === runId)
  const pause = line.paused !== null && line.paused.code !== REOPENED ? line.paused : null
  const paused = pause !== null
  // A safety pause: carrying on would skip the full check. A stopped or unfinished check paused
  // no report of its own, so it says why and offers the check; a failed one's run has its box.
  const safe = paused && safetyPause(pause?.code)
  const checkPause = paused && SAFETY_PAUSES.has(pause?.code ?? '')
  const going = line.writing !== null || line.waiting.length > 0
  if (going || paused) {
    const n = line.waiting.length
    // Nothing waiting: the red box's Resume, or the receipt, says it all.
    if ((!ours || paused) && n === 0) return null
    const place = linePlace(line)
    const chips = allChips ? line.waiting : line.waiting.slice(0, FOLD_CHIPS)
    const byItself = waitsByItself(pause)
    return (
      <section className="card linestrip mv" style={at(1)} aria-label="Up next">
        <div className="lh">
          <b>{line.writing && place.total > 1 ? `Report ${place.at.toLocaleString('en-US')} of ${place.total.toLocaleString('en-US')}` : 'Up next'}</b>
          {place.total > 1 && <span>{lineProgress(line, perReport)}</span>}
        </div>
        {pause && byItself && (
          <p className="wait" role="status">
            {waitText(pause)}
          </p>
        )}
        {pause && !byItself && pause.code === USAGE_WEEK && (
          <p className="why" role="status">
            {waitText(pause)}
          </p>
        )}
        {pause && !byItself && pause.code !== USAGE_WEEK && (
          <p className="why">
            {checkPause && pause ? safetyPauseText(pause.code, pause.message) : `The line is paused. Resume carries on with this report, then the ${n === 1 ? 'one' : n.toLocaleString('en-US')} waiting.`}
          </p>
        )}
        {n > 0 ? (
          <>
            <ul className="chips" aria-label="Waiting">
              {chips.map((item) => (
                <li key={item.ticker} title={item.name}>
                  <b>{item.ticker}</b>
                  <button className="x4" aria-label={`Take ${item.ticker} out of the line`} onClick={() => onRemove(item.ticker)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            {n > FOLD_CHIPS && <Fold open={allChips} total={n} onToggle={() => setAllChips((on) => !on)} />}
          </>
        ) : (
          <span className="last">This is the last one.</span>
        )}
        <div className="row">
          {!paused && (
            <button className="btn2" onClick={onAdd}>
              Add a company
            </button>
          )}
          {checkPause && onRecheck && (
            <button className="btn2" onClick={onRecheck}>
              Run it again
            </button>
          )}
          {pause && pause.code === USAGE_WEEK && n > 0 && (
            <button className="btn2 primary2" onClick={onCarryOn}>
              Carry on
            </button>
          )}
          {pause && !safe && pause.code !== USAGE_WEEK && n > 0 && (
            <button className="btn2" onClick={onCarryOn}>
              {byItself && !pause.run_id ? 'Carry on now' : 'Skip it and carry on'}
            </button>
          )}
          <ConfirmButton
            label="Cancel all"
            question={line.writing ? (n > 0 ? `Stop this report and drop the ${n.toLocaleString('en-US')} waiting?` : 'Stop this report?') : `Drop the ${n.toLocaleString('en-US')} waiting?`}
            yes="Cancel all"
            no="Keep going"
            onConfirm={onCancelAll}
          />
        </div>
        {!paused && adder}
      </section>
    )
  }
  if (!ours || line.finished.length < 2) return null
  const done = allDone ? line.finished : line.finished.slice(-FOLD_DONE)
  return (
    <section className="card linestrip mv" style={at(2)} aria-label="This line">
      <div className="lh">
        <b>{plural(line.finished.length, 'report', 'reports')} in this line</b>
        <span>{doneCount(line.finished)}</span>
      </div>
      <ul className="done" aria-label="How each went">
        {done.map((item) => (
          <DoneRow key={`${item.run_id ?? ''}-${item.ticker}`} item={item} onOpen={onOpen} />
        ))}
      </ul>
      {line.finished.length > FOLD_DONE && <Fold open={allDone} total={line.finished.length} onToggle={() => setAllDone((on) => !on)} />}
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
  const pause = line.paused
  const reopened = pause?.code === REOPENED
  if (pause && safetyPause(pause.code) && !(pause.code === 'LOCKDOWN_FAILED' && checkPassed)) {
    return (
      <div className={pause.code === 'LOCKDOWN_FAILED' ? 'card alert mv' : 'card alert note mv'} style={at(0)} role="status">
        <div>
          <b>The line is paused</b>
          <span>
            {safetyPauseText(pause.code, pause.message, checkReason)} {someNames(names)} {names.length === 1 ? 'is' : 'are'} waiting.
          </span>
        </div>
        <button className="btn2" disabled={checking} onClick={onRecheck}>
          {checking ? 'Checking…' : 'Run it again'}
        </button>
        <ConfirmButton label="Cancel all" question={`Drop the ${names.length.toLocaleString('en-US')} waiting?`} yes="Cancel all" no="Keep them" onConfirm={onCancelAll} />
      </div>
    )
  }
  const byItself = waitsByItself(pause)
  const week = pause?.code === USAGE_WEEK
  const them = names.length === 1 ? 'it' : 'them'
  let title = 'The line is paused'
  if (reopened) title = `${plural(names.length, 'report was', 'reports were')} waiting when Tearsheet closed`
  else if (byItself) title = 'The line is waiting'
  else if (week) title = 'Your weekly usage is past 80%'
  return (
    <div className="card alert note mv" style={at(0)} role="status">
      <div>
        <b>{title}</b>
        {reopened && <span>{someNames(names)}. Carry on writing them one after another, or clear the line.</span>}
        {!reopened && (byItself || week) && pause && (
          <span>
            {waitText(pause)} {someNames(names)} {names.length === 1 ? 'is' : 'are'} waiting.
          </span>
        )}
        {!reopened && !byItself && !week && (
          <span>
            {pause?.message} {someNames(names)} {names.length === 1 ? 'is' : 'are'} waiting. Carry on with {them}, or clear the line.
          </span>
        )}
      </div>
      <button className={week ? 'btn2 primary2' : 'btn2'} onClick={onCarryOn}>
        {byItself ? (pause?.run_id ? 'Skip it and carry on' : 'Carry on now') : 'Carry on'}
      </button>
      <ConfirmButton label="Clear" question={`Drop the ${names.length.toLocaleString('en-US')} waiting?`} yes="Clear" no="Keep them" onConfirm={onClear} />
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
