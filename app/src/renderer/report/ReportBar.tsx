// The report page's top bar, in the toolbar (the look Liam picked from round 2 of the top bar: A's
// ticker, price and day's move, then C's box). It fills the room between the window buttons and
// the toolbar's own buttons. A hidden ruler holds the bar once per level of DROPS (bar.ts); the
// bar shows the first level whose width fits the room, and looks again whenever the room or the
// numbers change. The parts take the pointer, so pointing at one says what it means; the space
// between them still drags the window.

import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { PriceRange, ReportBar as BarNumbers } from '../../shared/protocol'
import { shortDate } from '../nav'
import {
  baseNote,
  closeNote,
  dayMove,
  fitLevel,
  gap,
  LEVELS,
  money,
  moveNote,
  ordinal,
  peersNote,
  rangeMarks,
  rangeNote,
  ratingNote,
  shows,
  wholeDollars,
  type Part
} from './bar'

const RANGE_W = 80
const RANGE_H = 14

function RangeLine({ range, close }: { range: PriceRange; close: number }) {
  const pad = 5
  const m = rangeMarks(range, close)
  const x = (f: number) => pad + f * (RANGE_W - 2 * pad)
  const y = RANGE_H / 2
  const toward = range.base >= close ? 'up' : 'down'
  const from = Math.min(x(m.close), x(m.base))
  const to = Math.max(x(m.close), x(m.base))
  return (
    <svg viewBox={`0 0 ${RANGE_W} ${RANGE_H}`} width={RANGE_W} height={RANGE_H} aria-hidden="true">
      <rect className="track" x={x(m.bear)} y={y - 2} width={x(m.bull) - x(m.bear)} height={4} rx={2} />
      <rect className={`gap ${toward}`} x={from} y={y - 2} width={to - from} height={4} />
      <line className="tick" x1={x(m.base)} x2={x(m.base)} y1={y - 5} y2={y + 5} />
      <circle className="now" cx={x(m.close)} cy={y} r={4.5} />
    </svg>
  )
}

export interface BarLineProps {
  ticker: string
  name: string | null
  bar: BarNumbers
  level: number
  // The bar on show names the page; the ruler's copies are hidden and carry no heading.
  heading?: boolean
}

export function BarLine({ ticker, name, bar, level, heading = false }: BarLineProps) {
  const show = (part: Part) => shows(level, part)
  const move = dayMove(bar.close, bar.previous_close)
  const base = bar.range && bar.close !== null ? gap(bar.range.base, bar.close) : null
  const Ticker = heading ? 'h1' : 'span'
  const label = name ? `${ticker}, ${name}` : ticker
  const rating = bar.rating !== null && show('rating')
  const baseShown = bar.range !== null && base !== null && show('base')
  const rangeShown = bar.range !== null && bar.close !== null && show('range')
  const peersShown = bar.percentile !== null && show('peers')
  return (
    <div className="rbar-line">
      <Ticker className="rbar-tk" title={name ?? undefined} aria-label={heading ? label : undefined}>
        {ticker}
      </Ticker>
      {bar.close !== null && (
        <span className="rbar-px" title={closeNote(bar)}>
          {money.format(bar.close)}
        </span>
      )}
      {move && show('move') && (
        <span className={`rbar-mv ${move.dir}`} title={moveNote(bar)}>
          {show('dollars') ? `${move.dollars} (${move.percent})` : move.percent}
        </span>
      )}
      {bar.close_date && show('date') && <span className="rbar-when">{shortDate(bar.close_date)} close</span>}
      {(rating || baseShown || rangeShown || peersShown) && (
        <span className="rbar-box">
          {rating && bar.rating && (
            <span className={`rbar-rate ${bar.rating.toLowerCase()}`} title={ratingNote(bar)}>
              <b>{bar.rating}</b>
              {bar.capped && show('capped') && <small>capped</small>}
            </span>
          )}
          {baseShown && bar.range && base && (
            <span className="rbar-base" title={baseNote(bar.range)}>
              <small>Base</small>
              <b>{money.format(bar.range.base)}</b>
              <span className={base.dir}>{base.text}</span>
            </span>
          )}
          {rangeShown && bar.range && bar.close !== null && (
            <span className="rbar-rng" title={rangeNote(bar.range)}>
              <small>{wholeDollars.format(bar.range.bear)}</small>
              <RangeLine range={bar.range} close={bar.close} />
              <small>{wholeDollars.format(bar.range.bull)}</small>
            </span>
          )}
          {peersShown && bar.percentile !== null && (
            <span className="rbar-peers" title={peersNote(bar)}>
              <small>Peers</small>
              <b>{ordinal(bar.percentile)}</b>
            </span>
          )}
        </span>
      )}
    </div>
  )
}

export function ReportBar({ ticker, name, bar }: { ticker: string; name: string | null; bar: BarNumbers }) {
  const box = useRef<HTMLDivElement>(null)
  const ruler = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState(0)

  const measure = () => {
    const room = box.current?.clientWidth
    const lines = ruler.current?.children
    if (!room || !lines) return
    setLevel(fitLevel(Array.from(lines, (l) => l.getBoundingClientRect().width), room))
  }
  // After every render (new numbers, a new company), and whenever the room or the ruler changes
  // size: the window, the sidebar, the find field or the Numbers / Text switch. A new room is
  // drawn in the frame whose layout made it (flushSync), so a part never sits cut off for a frame
  // while the window is resized.
  useLayoutEffect(measure)
  useLayoutEffect(() => {
    const watch = new ResizeObserver(() => flushSync(measure))
    if (box.current) watch.observe(box.current)
    if (ruler.current) watch.observe(ruler.current)
    return () => watch.disconnect()
  }, [])

  return (
    <div ref={box} className="rbar">
      <BarLine ticker={ticker} name={name} bar={bar} level={level} heading />
      <div ref={ruler} className="rbar-ruler" aria-hidden="true">
        {Array.from({ length: LEVELS }, (_, i) => (
          <BarLine key={i} ticker={ticker} name={name} bar={bar} level={i} />
        ))}
      </div>
    </div>
  )
}

const DOC_ICON = (
  <svg className="doc" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3.5h7l4 4v12.5H7z" />
    <path d="M13.5 3.5V8H18" />
  </svg>
)

// The label of the menu of the company's other reports, beside the bar: the report's date.
export function reportDateLabel(createdAt: string) {
  return (
    <>
      {DOC_ICON}
      {shortDate(createdAt)}
    </>
  )
}
