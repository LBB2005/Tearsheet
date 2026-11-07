// Key metrics, opened bigger: each metric on its own line, with the company’s value, the peers’
// median and, if asked, every peer’s own value. This file is MetricsPane, not Metrics, because
// Metrics.ts would be read as metrics.ts beside it on a case-insensitive disk.

import { useEffect, useRef, useState, type ReactElement } from 'react'

import type { MetricItem } from '../../shared/protocol'
import { ViewFrame, type ViewProps } from '../panel/ViewFrame'
import { viewTitle } from '../panel/titles'
import { metricScale, sortMetrics, type MetricSort, type MetricsState } from './metrics'
import { pickKey } from './pick'
import { at } from './scale'

import './views.css'

const SORTS: { sort: MetricSort; label: string }[] = [
  { sort: 'report', label: 'Report order' },
  { sort: 'below', label: 'Share below' }
]

// What is pointed at or focused: a metric, or one of its peers.
type Pointed = { name: string; peer: number | null }

export function Metrics({ chrome, numbers, ticker, item, state, setState }: ViewProps<MetricsState>): ReactElement {
  const metrics: MetricItem[] | null = numbers.metrics && numbers.metrics.length > 0 ? numbers.metrics : null
  const [pointed, setPointed] = useState<Pointed | null>(null)
  const picked = metrics ? pickKey(item, metrics, (m) => m.name) : null
  const pickedName = metrics && picked !== null ? metrics[picked].name : null
  const pickedRow = useRef<HTMLDivElement | null>(null)
  const scrolled = useRef(false)
  const hasPeers = !!metrics?.some((m) => m.peers.length > 0)

  // The row the link named comes into view once; after that the reader scrolls for themselves.
  useEffect(() => {
    if (scrolled.current || !pickedRow.current) return
    scrolled.current = true
    pickedRow.current.scrollIntoView({ block: 'nearest' })
  })

  const from = pointed && metrics ? metrics.find((m) => m.name === pointed.name) : undefined
  const readout = from ? (pointed?.peer != null ? (from.peers[pointed.peer]?.readout ?? from.readout) : from.readout) : null

  const controls = (
    <>
      <div className="segc" role="group" aria-label="Sort by">
        {SORTS.map(({ sort, label }) => (
          <button key={sort} className={state.sort === sort ? 'on' : ''} aria-pressed={state.sort === sort} onClick={() => setState({ ...state, sort })}>
            {label}
          </button>
        ))}
      </div>
      <button
        className={state.peers && hasPeers ? 'tg on' : 'tg'}
        aria-pressed={state.peers && hasPeers}
        disabled={!hasPeers}
        title={hasPeers ? undefined : 'No peer values are stored for this report.'}
        onClick={() => setState({ ...state, peers: !state.peers })}
      >
        <i style={{ background: 'var(--accent2)' }} />
        Each peer
      </button>
      <button className={state.median ? 'tg on' : 'tg'} aria-pressed={state.median} onClick={() => setState({ ...state, median: !state.median })}>
        <i style={{ background: 'var(--muted)' }} />
        Peer median
      </button>
    </>
  )

  if (!metrics)
    return (
      <ViewFrame chrome={chrome} title={viewTitle('metrics', null)} subtitle={ticker} readout={readout}>
        <p className="vgap">Key metrics aren’t stored for this report.</p>
      </ViewFrame>
    )

  // Peer dots only show when the switch is on and there is something to show.
  const showPeers = state.peers && hasPeers
  return (
    <ViewFrame chrome={chrome} title={viewTitle('metrics', null)} subtitle={ticker} readout={readout} controls={controls}>
      <div className="mrows" onPointerLeave={() => setPointed(null)}>
        {sortMetrics(metrics, state.sort).map((m) => {
          const scale = metricScale(m, { ...state, peers: showPeers })
          return (
            <div
              key={m.name}
              ref={m.name === pickedName ? pickedRow : undefined}
              className={m.name === pickedName ? 'mrow picked' : 'mrow'}
              tabIndex={0}
              onPointerEnter={() => setPointed({ name: m.name, peer: null })}
              onFocus={() => setPointed({ name: m.name, peer: null })}
              onBlur={() => setPointed(null)}
            >
              <span className="mname">{m.label}</span>
              <span className="mval">{m.text}</span>
              <span className="mtrack">
                {state.median && m.peer_median !== null && <i className="mmed" style={{ left: `${at(m.peer_median, scale)}%` }} title={m.median_text ?? undefined} />}
                {showPeers &&
                  m.peers.map((p, i) => (
                    <button
                      key={i}
                      className="mpeer"
                      style={{ left: `${at(p.value, scale)}%` }}
                      aria-label={`${p.ticker}: ${p.text}`}
                      onPointerEnter={(e) => {
                        e.stopPropagation()
                        setPointed({ name: m.name, peer: i })
                      }}
                      onPointerLeave={() => setPointed({ name: m.name, peer: null })}
                      onFocus={(e) => {
                        e.stopPropagation()
                        setPointed({ name: m.name, peer: i })
                      }}
                    />
                  ))}
                <i className="mdot" style={{ left: `${at(m.value, scale)}%` }} />
              </span>
            </div>
          )
        })}
      </div>
    </ViewFrame>
  )
}
