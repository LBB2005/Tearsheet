// Score by factor, opened bigger: each factor’s percentile among its peers and its weight in the
// score, sorted either way, with a line at the peers’ median. This file is FactorsPane, not Factors,
// because Factors.ts would be read as factors.ts beside it on a case-insensitive disk.

import { useEffect, useRef, useState, type ReactElement } from 'react'

import type { FactorItem } from '../../shared/protocol'
import { ViewFrame, type ViewProps } from '../panel/ViewFrame'
import { viewTitle } from '../panel/titles'
import { sortFactors, type FactorSort, type FactorsState } from './factors'
import { pickIndex } from './pick'

import './views.css'

const SORTS: { sort: FactorSort; label: string }[] = [
  { sort: 'percentile', label: 'Percentile' },
  { sort: 'weight', label: 'Weight' }
]

const pct = (w: number): string => `${Math.round(w * 1000) / 10}%`

export function Factors({ chrome, numbers, ticker, item, state, setState }: ViewProps<FactorsState>): ReactElement {
  const factors: FactorItem[] | null = numbers.factors && numbers.factors.length > 0 ? numbers.factors : null
  const [pointed, setPointed] = useState<number | null>(null)
  const picked = factors ? pickIndex(item, factors.length) : null
  const pickedRow = useRef<HTMLButtonElement | null>(null)
  const scrolled = useRef(false)

  // The row the link named comes into view once; after that the reader scrolls for themselves.
  useEffect(() => {
    if (scrolled.current || !pickedRow.current) return
    scrolled.current = true
    pickedRow.current.scrollIntoView({ block: 'nearest' })
  })

  const readout = pointed !== null && factors?.[pointed] ? factors[pointed].readout : numbers.score_readout

  const controls = (
    <>
      <div className="segc" role="group" aria-label="Sort by">
        {SORTS.map(({ sort, label }) => (
          <button key={sort} className={state.sort === sort ? 'on' : ''} aria-pressed={state.sort === sort} onClick={() => setState({ ...state, sort })}>
            {label}
          </button>
        ))}
      </div>
      <button className={state.median ? 'tg on' : 'tg'} aria-pressed={state.median} onClick={() => setState({ ...state, median: !state.median })}>
        <i style={{ background: 'var(--muted)' }} />
        Peer median
      </button>
    </>
  )

  if (!factors)
    return (
      <ViewFrame chrome={chrome} title={viewTitle('factors', null)} subtitle={ticker} readout={readout}>
        <p className="vgap">Score by factor isn’t stored for this report.</p>
      </ViewFrame>
    )

  const top = Math.max(...factors.map((f) => f.weight))
  return (
    <ViewFrame chrome={chrome} title={viewTitle('factors', null)} subtitle={ticker} readout={readout} controls={controls}>
      <div className="frows" onPointerLeave={() => setPointed(null)}>
        {state.median && (
          <div className="frow fhead" aria-hidden="true">
            <span />
            <span className="fmid">
              <span className="fmed">Peer median</span>
            </span>
            <span />
          </div>
        )}
        {sortFactors(factors, state.sort).map(({ at, f }) => (
          <button
            key={at}
            ref={at === picked ? pickedRow : undefined}
            className={at === picked ? 'frow picked' : 'frow'}
            onPointerEnter={() => setPointed(at)}
            onFocus={() => setPointed(at)}
            onBlur={() => setPointed(null)}
          >
            <span className="fname">{f.name}</span>
            <span className="fmid">
              {state.median && <i className="fline" />}
              <span className="ftrack">
                <i className="fbar" style={{ width: `${Math.max(0, Math.min(100, f.percentile))}%` }} />
              </span>
              <span className="fwrow">
                <span className="fwtrack">
                  <i className="fwbar" style={{ width: `${top > 0 ? (f.weight / top) * 100 : 0}%` }} />
                </span>
                <small>{pct(f.weight)} of the score</small>
              </span>
            </span>
            <span className="fpct">{Math.round(f.percentile)}</span>
          </button>
        ))}
      </div>
    </ViewFrame>
  )
}
