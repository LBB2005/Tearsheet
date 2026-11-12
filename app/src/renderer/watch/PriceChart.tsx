// The Watchlist's price chart for one company: its closes over the chosen span, then, in a band
// of its own to the right, the report's 12-month range fanned out from the report's close to the
// low, base and high, with the price where the rating would change as a dotted line. Every price
// is in the last close's shares (the engine divides by any split since the report).

import { useMemo, useState } from 'react'

import type { WatchLevels, WatchRow } from '../../shared/protocol'
import { niceTicks } from '../chart/series'
import { shortDate } from '../nav'
import { money } from '../shell/Sidebar'
import { flipOf } from './watch'

const W = 760
const H = 260
const L = 54
const R = 16
const T = 14
const B = 26

export interface PriceChartProps {
  row: WatchRow
  dates: string[]
  close: number[]
  // How many closes to show, from the newest back.
  span: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (v: number) => (v >= 1000 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(v >= 100 ? 0 : 2)}`)

// The fan's three paths from the report's close: the base straight (on a log scale), the low and
// the high opening out like the square root of time, as a range of outcomes does.
function fan(start: number, lv: WatchLevels): { bear: number[]; base: number[]; bull: number[] } | null {
  if (lv.bear === null || lv.base === null || lv.bull === null || !(start > 0)) return null
  const steps = Array.from({ length: 25 }, (_, k) => k / 24)
  const path = (to: number, sqrt: boolean) => steps.map((f) => start * Math.pow(to / start, sqrt ? Math.sqrt(f) : f))
  return { bear: path(lv.bear, true), base: path(lv.base, false), bull: path(lv.bull, true) }
}

export function PriceChart({ row, dates, close, span }: PriceChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const lv = row.levels
  const drawn = useMemo(() => {
    const from = Math.max(0, close.length - span)
    const ds = dates.slice(from)
    const cs = close.slice(from)
    const n = cs.length
    const future = lv && lv.bear !== null ? Math.round(n * 0.55) : 0
    const slots = Math.max(2, n + future)
    // The close the report was priced at: its date, else the newest close before it.
    let ri = -1
    if (lv) for (let i = 0; i < ds.length; i++) if (ds[i] <= lv.price_date) ri = i
    const start = lv?.report_price ?? (ri >= 0 ? cs[ri] : null)
    const f = lv && start ? fan(start, lv) : null
    const flip = flipOf(row)
    const values = [...cs, ...(f ? [...f.bear, ...f.bull] : []), ...(flip ? [flip.price] : [])].filter((v) => Number.isFinite(v) && v > 0)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    const pad = (hi - lo) * 0.06 || 1
    lo -= pad
    hi += pad
    const x = (i: number) => L + (i / (slots - 1)) * (W - L - R)
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    const line = cs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
    const fanStart = ri >= 0 ? ri : n - 1
    const fanX = (k: number) => x(fanStart + ((slots - 1 - fanStart) * k) / 24)
    const fanPath = (vals: number[]) => vals.map((v, k) => `${k ? 'L' : 'M'}${fanX(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')
    // The shaded range: along the high, then back along the low, each point at its own x.
    const bandPath = (hi: number[], lo: number[]) =>
      [...hi.map((v, k) => [fanX(k), y(v)]), ...lo.map((v, k) => [fanX(k), y(v)]).reverse()].map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('') + 'Z'
    const months: { i: number; label: string }[] = []
    let last = ''
    ds.forEach((d, i) => {
      const m = d.slice(0, 7)
      if (m !== last && i > 2) months.push({ i, label: MONTHS[Number(m.slice(5, 7)) - 1] + (m.endsWith('-01') ? ` ${m.slice(0, 4)}` : '') })
      last = m
    })
    const every = Math.ceil(months.length / 7)
    return { ds, cs, n, slots, ri, f, flip, lo, hi, x, y, line, fanPath, bandPath, fanStart, months: months.filter((_, k) => k % every === 0), ticks: niceTicks(lo, hi, 4) }
  }, [dates, close, span, lv, row])

  if (drawn.n < 2) return <p className="wempty">Not enough closes stored to draw a chart yet.</p>
  const { ds, cs, n, slots, ri, f, flip, x, y, line, fanPath, bandPath, months, ticks } = drawn
  const futureX = x(n - 1)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const i = Math.round(((px - L) / (W - L - R)) * (slots - 1))
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <div className="wchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${row.ticker} closes${f ? ' and the report’s 12-month range' : ''}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="gy" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text className="gl" x={L - 6} y={y(v) + 4} textAnchor="end">
              {short(v)}
            </text>
          </g>
        ))}
        {months.map((m) => (
          <text key={m.i} className="gl" x={x(m.i)} y={H - 7} textAnchor="middle">
            {m.label}
          </text>
        ))}
        {f && lv && (
          <g>
            <rect className="future" x={futureX} y={T} width={W - R - futureX} height={H - T - B} />
            <line className="gz" x1={futureX} x2={futureX} y1={T} y2={H - B} />
            <text className="gl" x={futureX + 6} y={T + 12}>
              Next 12 months
            </text>
            <path className="band" d={bandPath(f.bull, f.bear)} />
            <path className="hi" d={fanPath(f.bull)} />
            <path className="lo" d={fanPath(f.bear)} />
            <path className="mid" d={fanPath(f.base)} />
            <text className="gl hi" x={W - R - 4} y={y(lv.bull!) - 6} textAnchor="end">
              High {short(lv.bull!)}
            </text>
            <text className="gl mid" x={W - R - 4} y={y(lv.base!) - 6} textAnchor="end">
              Base {short(lv.base!)}
            </text>
            <text className="gl lo" x={W - R - 4} y={y(lv.bear!) + 14} textAnchor="end">
              Low {short(lv.bear!)}
            </text>
            {ri >= 0 && (
              <>
                <line className="when" x1={x(ri)} x2={x(ri)} y1={T} y2={H - B} />
                <text className="gl" x={x(ri) - 4} y={T + 26} textAnchor="end">
                  Report {shortDate(lv.report_date)}
                </text>
              </>
            )}
          </g>
        )}
        {flip && (
          <g>
            <line className="flip" x1={L} x2={W - R} y1={y(flip.price)} y2={y(flip.price)} />
            <text className="gl flip" x={L + 4} y={y(flip.price) - 5}>
              {flip.to} {flip.above ? 'above' : 'below'} {short(flip.price)}
            </text>
          </g>
        )}
        <path className="price" d={line} />
        <circle className="dot" cx={x(n - 1)} cy={y(cs[n - 1])} r={3} />
        {hover !== null && (
          <g>
            <line className="guide" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />
            <circle className="dot" cx={x(hover)} cy={y(cs[hover])} r={4} />
          </g>
        )}
      </svg>
      <p className="wread" aria-live="polite">
        {hover !== null ? (
          <>
            {shortDate(ds[hover])}: <b>{money.format(cs[hover])}</b>
            {lv?.base != null && (
              <>
                {' '}
                · to base {lv.base >= cs[hover] ? '+' : '−'}
                {Math.abs((lv.base / cs[hover] - 1) * 100).toFixed(1)}%
              </>
            )}
          </>
        ) : (
          <>Point at the chart to read a close.</>
        )}
      </p>
    </div>
  )
}
