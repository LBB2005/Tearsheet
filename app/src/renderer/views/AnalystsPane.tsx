// Analyst ratings, opened bigger from the report's panel: analystdb's view of the company as of the
// report's price date (engine: data/analystdb.py, get_analysts), in three tabs: every firm with
// its track record, the recent changes, and the trust check against S&P Global. It is the
// street's view, research data and not investment advice, and never part of Tearsheet's own
// rating. Every figure and its readout comes written from the engine; pointing at a row reads it
// out. When analystdb is off the view is its quiet note, with Try again.

import { useEffect, useState, type ReactElement, type ReactNode } from 'react'

import type { ReportAnalysts } from '../../shared/protocol'
import { ViewFrame, type ViewProps } from '../panel/ViewFrame'
import { dayText } from '../nav'
import { viewTitle } from '../panel/titles'
import { andList, firmsOn, SIDES, sideCount, stateFor, type AnalystsState, type AnalystsTab } from './analysts'
import { useAnalysts } from './useAnalysts'

import './views.css'

// A table row that reads itself out while pointed at or focused.
interface Point {
  on: (readout: string) => void
  off: () => void
}

const rowProps = (readout: string, point: Point) => ({
  tabIndex: 0,
  onPointerEnter: () => point.on(readout),
  onFocus: () => point.on(readout),
  onBlur: point.off
})

const tone = (text: string): string => (text.startsWith('+') ? 'aup' : text.startsWith('−') ? 'adown' : '')

function Firms({ view, state, setState, point }: { view: ReportAnalysts; state: AnalystsState; setState: (s: AnalystsState) => void; point: Point }) {
  const shown = firmsOn(view.firms ?? [], state.side)
  const sideName = SIDES.find((s) => s.side === state.side)?.label ?? ''
  return (
    <>
      <div className="segc aside" role="group" aria-label="Show the firms rating">
        {SIDES.map(({ side, label }) => (
          <button key={side} className={state.side === side ? 'on' : ''} aria-pressed={state.side === side} onClick={() => setState({ ...state, side })}>
            {label} <b>{sideCount(view, side)}</b>
          </button>
        ))}
      </div>
      {view.firms_note && <p className="anote">{view.firms_note}</p>}
      {shown.length === 0 ? (
        <p className="vgap">No firm rates it {sideName}.</p>
      ) : (
        <div className="atw">
          <table className="atable">
            <thead>
              <tr>
                <th>Firm</th>
                <th>Rating</th>
                <th className="num">Target</th>
                <th className="num">Date</th>
                <th className="num">Rank</th>
                <th className="num">Calls vs S&amp;P 500</th>
              </tr>
            </thead>
            <tbody onPointerLeave={point.off}>
              {shown.map((f) => (
                <tr key={f.firm_slug} {...rowProps(f.readout, point)}>
                  <td>{f.firm}</td>
                  <td className={f.side ? `awrap a${f.side}` : 'awrap'}>{f.label}</td>
                  <td className="num">{f.target_text}</td>
                  <td className="num">{dayText(f.date_text)}</td>
                  <td className={f.rank === null ? 'num adim' : 'num'}>{f.rank_text}</td>
                  <td className={f.avg_excess === null ? 'num adim' : `num ${tone(f.excess_text)}`}>{f.excess_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view.ranked_of !== null && (
        <p className="anote">
          Each firm’s latest rating within the past year. Rank is among the {view.ranked_of} firms analystdb ranks by track record; calls vs S&amp;P 500 is the
          average return of a firm’s rating calls over the S&amp;P 500, up to 12 months. Track records as of {view.tracks_asof_text && dayText(view.tracks_asof_text)}.
        </p>
      )}
    </>
  )
}

function Changes({ view, point }: { view: ReportAnalysts; point: Point }) {
  if (view.changes === null) return <p className="anote">{view.changes_note}</p>
  if (view.changes.length === 0) return <p className="vgap">No rating or target changes up to {dayText(view.asof_text)}.</p>
  return (
    <>
      <div className="atw">
        <table className="atable">
          <thead>
            <tr>
              <th className="num">Date</th>
              <th>Firm</th>
              <th>Change</th>
              <th>Rating</th>
              <th className="num">Target</th>
            </tr>
          </thead>
          <tbody onPointerLeave={point.off}>
            {view.changes.map((c, at) => (
              <tr key={`${c.date}-${c.firm}-${at}`} {...rowProps(c.readout, point)}>
                <td className="num">{dayText(c.date_text)}</td>
                <td>{c.firm}</td>
                <td className={c.action === 'up' ? 'aup' : c.action === 'down' ? 'adown' : ''}>{c.action_label}</td>
                <td className="awrap">{c.rating_text}</td>
                <td className="num">{c.target_text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="anote">
        The {view.changes.length} latest rating and target changes up to {dayText(view.asof_text)}, newest first.
      </p>
    </>
  )
}

function Check({ view, point }: { view: ReportAnalysts; point: Point }) {
  const check = view.check
  if (check === null) return <p className="anote">{view.check_note}</p>
  const mean = check.rows.find((r) => r.measure === 'target_mean')
  return (
    <>
      {mean && (
        <div className="ahero" role="group" aria-label="Average target against S&P Global">
          <div>
            <span>Our average target</span>
            <b>{mean.ours_text}</b>
            <small>analystdb</small>
          </div>
          <div>
            <span>S&amp;P Global’s</span>
            <b>{mean.theirs_text}</b>
            <small>fetched {dayText(check.fetched_text)}</small>
          </div>
          <div>
            <span>Gap</span>
            <b className={mean.within_tolerance ? '' : 'aoff'}>{mean.gap_text}</b>
            <small>
              {mean.within_tolerance ? 'within' : 'outside'} the {mean.tolerance_text} tolerance
            </small>
          </div>
        </div>
      )}
      <div className="atw">
        <table className="atable">
          <thead>
            <tr>
              <th>Measure</th>
              <th className="num">analystdb</th>
              <th className="num">S&amp;P Global</th>
              <th className="num">Gap</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody onPointerLeave={point.off}>
            {check.rows.map((r) => (
              <tr key={r.measure} {...rowProps(r.readout, point)}>
                <td>{r.label}</td>
                <td className="num">{r.ours_text}</td>
                <td className="num">{r.theirs_text}</td>
                <td className="num">{r.gap_text}</td>
                <td className={r.within_tolerance ? 'adim' : 'aoff'}>{r.within_tolerance ? 'within tolerance' : 'outside tolerance'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="anote">
        S&amp;P Global, fetched {dayText(check.fetched_text)}. analystdb’s free sources carry about two-thirds of the analyst changes the big data firms list, so its firm
        counts run lower than S&amp;P Global’s; the targets it does carry are accurate.
      </p>
    </>
  )
}

export function Analysts({ chrome, numbers, ticker, item, state, setState }: ViewProps<AnalystsState>): ReactElement {
  const { view, problem, retry } = useAnalysts(numbers.report_id)
  const [pointed, setPointed] = useState<string | null>(null)
  const point: Point = { on: setPointed, off: () => setPointed(null) }
  // A link from the report picks the tab and side it names, also while the view is open.
  useEffect(() => {
    const next = stateFor(item, state)
    if (next !== state) setState(next)
    // Only a new link changes the view; the tabs change it the rest of the time.
  }, [item])

  const title = viewTitle('analysts', null)
  const frame = (subtitle: string, body: ReactNode, controls?: ReactNode) => (
    <ViewFrame chrome={chrome} title={title} subtitle={subtitle} readout={pointed} controls={controls}>
      {body}
    </ViewFrame>
  )

  if (problem)
    return frame(
      ticker,
      <div className="cmsg" role="alert">
        <p>This view didn’t load. {problem}</p>
        <button className="plain" onClick={retry}>
          Try again
        </button>
      </div>
    )
  if (!view) return frame(ticker, <div className="skel" aria-label="Loading this view" />)
  if (view.state !== 'ok')
    return frame(
      view.ticker,
      <div className="cmsg">
        <p>{view.note}</p>
        {view.state === 'down' && (
          <button className="plain" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    )

  const tabs: { tab: AnalystsTab; label: string; count: number | null }[] = [
    { tab: 'firms', label: 'Firms', count: view.n_firms },
    { tab: 'changes', label: 'Recent changes', count: view.changes ? view.changes.length : null },
    { tab: 'check', label: 'Trust check', count: null }
  ]
  const controls = (
    <div className="segc atabs" role="tablist" aria-label="Analyst ratings">
      {tabs.map(({ tab, label, count }) => (
        <button
          key={tab}
          role="tab"
          className={state.tab === tab ? 'on' : ''}
          aria-selected={state.tab === tab}
          onClick={() => {
            setPointed(null)
            setState({ ...state, tab })
          }}
        >
          {label}
          {count !== null && (
            <>
              {' '}
              <b>{count}</b>
            </>
          )}
        </button>
      ))}
    </div>
  )
  const subtitle = `${view.ticker} · analystdb, as of ${dayText(view.asof_text)}${view.rebuilt ? ', rebuilt from history' : ''}`
  return frame(
    subtitle,
    <div className="avw" role="tabpanel" aria-label={tabs.find((t) => t.tab === state.tab)?.label}>
      {view.stale.length > 0 && <p className="anote warn">Some of this may be out of date: {andList(view.stale)} missed analystdb’s last evening run.</p>}
      {state.tab === 'firms' && <Firms view={view} state={state} setState={setState} point={point} />}
      {state.tab === 'changes' && <Changes view={view} point={point} />}
      {state.tab === 'check' && <Check view={view} point={point} />}
      <p className="afoot">Source: analystdb{view.check ? ', with S&P Global’s figures for the trust check' : ''}. Research data, not investment advice.</p>
    </div>,
    controls
  )
}
