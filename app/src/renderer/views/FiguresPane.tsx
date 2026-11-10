// Red flags, the economy and the rings, opened bigger: the same figures as in the report, larger,
// each with its readout on pointer or focus. The three share this file because they share the
// readout wiring and have no switches of their own.

import { useState, type ReactElement } from 'react'

import type { EconomyItem, Ring, Slice } from '../../shared/protocol'
import { ViewFrame, type ViewProps } from '../panel/ViewFrame'
import { dayText } from '../nav'
import { viewTitle } from '../panel/titles'
import { NO_PEER_LIST, ringArcs, SLICE_COLOUR } from './figures'
import { pickKey } from './pick'

import './views.css'

const missing = (what: string): ReactElement => <p className="vgap">{what} isn’t stored for this report.</p>

export function RedFlags({ chrome, numbers, ticker, item }: ViewProps<null>): ReactElement {
  const flags = numbers.red_flags && numbers.red_flags.length > 0 ? numbers.red_flags : null
  const [pointed, setPointed] = useState<number | null>(null)
  const title = viewTitle('flags', null)
  if (!flags)
    return (
      <ViewFrame chrome={chrome} title={title} subtitle={ticker}>
        {missing(title)}
      </ViewFrame>
    )
  const picked = pickKey(item, flags, (f) => f.code)
  const found = flags.filter((f) => f.found).length
  const readout = pointed !== null && flags[pointed] ? flags[pointed].readout : numbers.red_flags_readout
  return (
    <ViewFrame chrome={chrome} title={title} subtitle={ticker} readout={readout}>
      <div className="rfmeter" aria-label={`${found} of ${flags.length} checks found`}>
        <div className="rfcells" aria-hidden="true">
          {flags.map((f) => (
            <i key={f.code} className={f.found ? 'found' : ''} />
          ))}
        </div>
        <b>
          {found} of {flags.length}
        </b>
      </div>
      <div className="rfrows" onPointerLeave={() => setPointed(null)}>
        {flags.map((f, at) => (
          <button
            key={f.code}
            className={at === picked ? 'rfrow picked' : 'rfrow'}
            onPointerEnter={() => setPointed(at)}
            onFocus={() => setPointed(at)}
            onBlur={() => setPointed(null)}
          >
            <span>{f.label}</span>
            <span className={f.found ? 'rfstate found' : 'rfstate'}>{f.found ? 'Found' : 'Clear'}</span>
          </button>
        ))}
      </div>
    </ViewFrame>
  )
}

export function Economy({ chrome, numbers, ticker, item }: ViewProps<null>): ReactElement {
  const figures: EconomyItem[] | null = numbers.economy && numbers.economy.length > 0 ? numbers.economy : null
  const [pointed, setPointed] = useState<number | null>(null)
  const title = viewTitle('economy', null)
  if (!figures)
    return (
      <ViewFrame chrome={chrome} title={title} subtitle={ticker}>
        {missing(title)}
      </ViewFrame>
    )
  const picked = pickKey(item, figures, (e) => e.series)
  const readout = pointed !== null && figures[pointed] ? figures[pointed].readout : null
  return (
    <ViewFrame chrome={chrome} title={title} subtitle={ticker} readout={readout}>
      <div className="etiles" onPointerLeave={() => setPointed(null)}>
        {figures.map((e, at) => (
          <button
            key={e.series}
            className={at === picked ? 'etile picked' : 'etile'}
            onPointerEnter={() => setPointed(at)}
            onFocus={() => setPointed(at)}
            onBlur={() => setPointed(null)}
          >
            <small>{e.label}</small>
            <b>{e.value}</b>
            <small>{dayText(e.date)}</small>
          </button>
        ))}
      </div>
    </ViewFrame>
  )
}

const SIZE = 160
const RADIUS = 62
const GAP = 0.012

// An arc of the ring between two fractions of the way round, starting at the top.
function arcPath(from: number, to: number): string {
  const point = (f: number) => {
    const a = f * 2 * Math.PI - Math.PI / 2
    return `${(SIZE / 2 + RADIUS * Math.cos(a)).toFixed(2)} ${(SIZE / 2 + RADIUS * Math.sin(a)).toFixed(2)}`
  }
  // A whole turn can't be one arc, so it is stopped a hair short.
  const end = Math.min(to, from + 0.9999)
  return `M ${point(from)} A ${RADIUS} ${RADIUS} 0 ${end - from > 0.5 ? 1 : 0} 1 ${point(end)}`
}

function RingFigure({
  heading,
  ring,
  noList,
  picked,
  onPoint
}: {
  heading: string
  ring: Ring | null
  // What a slice's list says when the run kept no items.
  noList: string
  picked: string | null
  onPoint: (readout: string | null) => void
}): ReactElement {
  if (!ring) return <section className="ringfig">{missing(heading)}</section>
  const arcs = ringArcs(ring, GAP)
  const slice = (key: Slice['key']) => ring.slices.find((s) => s.key === key)
  return (
    <section className="ringfig">
      <h3>{heading}</h3>
      <svg className="ringsvg" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={heading}>
        {arcs.map((a) => {
          const s = slice(a.key)!
          return (
            <path
              key={a.key}
              className={a.key === picked ? 'rarc picked' : 'rarc'}
              d={arcPath(a.from, a.to)}
              stroke={SLICE_COLOUR[a.key]}
              tabIndex={0}
              role="img"
              aria-label={s.readout}
              onPointerEnter={() => onPoint(s.readout)}
              onPointerLeave={() => onPoint(null)}
              onFocus={() => onPoint(s.readout)}
              onBlur={() => onPoint(null)}
            />
          )
        })}
        <text x={SIZE / 2} y={SIZE / 2} className="rtotal" textAnchor="middle" dominantBaseline="central">
          {ring.total}
        </text>
      </svg>
      <div className="rlists">
        {ring.slices.map((s) => (
          <details key={s.key} open={s.key === picked}>
            <summary>
              <i style={{ background: SLICE_COLOUR[s.key] }} />
              {s.label} <span className="rcount">{s.count}</span>
            </summary>
            {s.items ? (
              s.items.length > 0 ? (
                <ul>
                  {s.items.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="rnone">Nothing here.</p>
              )
            ) : (
              <p className="rnone">{noList}</p>
            )}
          </details>
        ))}
      </div>
    </section>
  )
}

export function Rings({ chrome, numbers, ticker, item }: ViewProps<null>): ReactElement {
  const [readout, setReadout] = useState<string | null>(null)
  const { peer_ratings: peers, claims } = numbers
  // The two rings use different keys, so one item names a slice in at most one of them.
  const picked = item !== null && [peers, claims].some((r) => r?.slices.some((s) => s.key === item)) ? item : null
  return (
    <ViewFrame chrome={chrome} title={viewTitle('rings', null)} subtitle={ticker} readout={readout}>
      <div className="rings">
        <RingFigure heading="Peer ratings" ring={peers} noList={NO_PEER_LIST} picked={picked} onPoint={setReadout} />
        <RingFigure heading="Claim checks" ring={claims} noList="What was checked isn’t stored for this report." picked={picked} onPoint={setReadout} />
      </div>
    </ViewFrame>
  )
}
