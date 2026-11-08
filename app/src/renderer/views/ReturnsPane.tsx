// Total return, opened bigger: a bar for the company, the peers, the S&P 500 and, if asked, each
// peer, all running from one zero line, over 1, 3 or 5 years where the prices are stored. This
// file is ReturnsPane, not Returns, because Returns.ts would be read as returns.ts beside it on a
// case-insensitive disk.

import { useEffect, useRef, useState, type ReactElement } from 'react'

import { ViewFrame, type ViewProps } from '../panel/ViewFrame'
import { viewTitle } from '../panel/titles'
import { PEERS_NOTE, SPANS_NOTE, returnRows, returnText, shownSpan, spansOffered, type ReturnsState, type Years } from './returns'
import { at, scaleOf } from './scale'

import './views.css'

const SPANS: Years[] = [1, 3, 5]

export function Returns({ chrome, numbers, ticker, item, state, setState }: ViewProps<ReturnsState>): ReactElement {
  const spans = numbers.returns && numbers.returns.length > 0 ? numbers.returns : null
  const [pointed, setPointed] = useState<number | null>(null)
  const span = spans ? shownSpan(spans, state.years) : null
  const rows = span ? returnRows(span, state) : []
  // A link names the company, the peers or the S&P 500; each peer is only ever reached by pointing.
  const pickedKind = rows.find((r) => r.kind !== 'peer' && r.kind === item)?.kind ?? null
  const pickedRow = useRef<HTMLDivElement | null>(null)
  const scrolled = useRef(false)

  // The row the link named comes into view once; after that the reader scrolls for themselves.
  useEffect(() => {
    if (scrolled.current || !pickedRow.current) return
    scrolled.current = true
    pickedRow.current.scrollIntoView({ block: 'nearest' })
  })

  const readout = pointed !== null ? (rows[pointed]?.row.readout ?? null) : null

  if (!spans || !span)
    return (
      <ViewFrame chrome={chrome} title={viewTitle('returns', null)} subtitle={ticker} readout={readout}>
        <p className="vgap">Total return isn’t stored for this report.</p>
      </ViewFrame>
    )

  const offered = spansOffered(spans)
  const hasPeers = span.peers !== null
  const toggle = (key: 'peers' | 'spy' | 'each', label: string, swatch: string, needsPeers: boolean) => {
    const off = needsPeers && !hasPeers
    return (
      <button
        className={state[key] && !off ? 'tg on' : 'tg'}
        aria-pressed={state[key] && !off}
        disabled={off}
        title={off ? PEERS_NOTE : undefined}
        onClick={() => setState({ ...state, [key]: !state[key] })}
      >
        <i style={{ background: swatch }} />
        {label}
      </button>
    )
  }
  const controls = (
    <>
      <div className="segc" role="group" aria-label="Span">
        {SPANS.map((y) => {
          const on = offered.includes(y)
          return (
            <button
              key={y}
              className={span.years === y ? 'on' : ''}
              aria-pressed={span.years === y}
              disabled={!on}
              title={on ? undefined : SPANS_NOTE}
              onClick={() => setState({ ...state, years: y })}
            >
              {y}Y
            </button>
          )
        })}
      </div>
      {toggle('peers', 'Peers', 'var(--accent)', true)}
      {toggle('spy', 'S&P 500', 'var(--accent)', false)}
      {toggle('each', 'Each peer', 'var(--accent)', true)}
    </>
  )

  // The bars grow from zero, so zero is always on the line, even when every return is above it.
  const scale = scaleOf([0, ...rows.flatMap((r) => (r.row.value === null ? [] : [r.row.value]))], 0.1)
  const zero = at(0, scale)

  return (
    <ViewFrame chrome={chrome} title={viewTitle('returns', null)} subtitle={ticker} readout={readout} controls={controls}>
      <div className="rrows" onPointerLeave={() => setPointed(null)}>
        {rows.map(({ kind, row }, i) => {
          const v = row.value
          const colour = kind === 'company' ? 'var(--hold)' : v !== null && v < 0 ? 'var(--down)' : 'var(--accent)'
          const isPicked = kind === pickedKind
          const end = v === null ? zero : at(v, scale)
          return (
            <div
              key={`${kind}-${row.name}`}
              ref={isPicked ? pickedRow : undefined}
              className={isPicked ? 'mrow picked' : 'mrow'}
              tabIndex={0}
              onPointerEnter={() => setPointed(i)}
              onFocus={() => setPointed(i)}
              onBlur={() => setPointed(null)}
            >
              <span className="mname">{row.name}</span>
              <span className="mval">{returnText(v)}</span>
              <span className="mtrack rtrack">
                <i className="rzero" style={{ left: `${zero}%` }} />
                {v !== null && <i className="retbar" style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%`, background: colour }} />}
              </span>
            </div>
          )
        })}
      </div>
      {span.years > 1 && <p className="vgap">{PEERS_NOTE}</p>}
      {offered.length < SPANS.length && <p className="vgap">{SPANS_NOTE}</p>}
    </ViewFrame>
  )
}
