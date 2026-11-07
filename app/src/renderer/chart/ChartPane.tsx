// The price chart beside the report (the spec's "The chart"). It is app UI, not part of the report
// frame, so it can be interactive. It draws, in SVG:
//   - the daily closes, adjusted for splits, with the volume underneath;
//   - markers for the SEC filings the report read, and the buy-trigger line;
//   - three toggles, all off at first: the 12-month range as a fan ahead of today, the peers
//     (equal-weighted) and the S&P 500. With either compare line on, every line starts from 100,
//     and the company's line is its total return, on the same basis as the peers and SPY.
// Hover reads a day's price, change and volume; dragging across measures two dates. The ranges
// are 1W to All (series.ts). 5Y and All, the first time, download the company's full price
// history (fetch_history: its bars, splits and dividends, and SPY's if they aren't stored yet),
// then read the chart again. If the history is still
// short, 5Y greys out and All shows what is there, with a note. The series comes from
// get_chart. Motion: the line traces and the volume rises as the chart opens (chart.css); after
// that, a range or toggle change glides the lines to their new shape (glide.ts), and a part that
// comes or goes fades. Nothing moves under Reduce motion.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'

import type { CallResult } from '../../preload/api'
import type { ChartSeries } from '../../shared/protocol'
import { shortDate } from '../nav'
import { money } from '../shell/Sidebar'
import { covers, measure, namedFilings, needsHistory, niceTicks, RANGE_ORDER, rebase, slice, volumeText, yearsServed, type Range } from './series'
import { GLIDE_MS, glideTrack, nextGlide, resample, trackXs, type Track } from './glide'
import { SHARE_DEFAULT, shareFor, volumeHeight } from './height'
import { setVolumeOn, setVolumeShare, startRange, volumeOn, volumeShare } from './prefs'
import { PRESETS, type Preset, type SnapMode } from './split'

import './chart.css'

export interface ChartPaneProps {
  reportId: string
  // The company: its history is downloaded once a session, whichever of its reports asks.
  cik: number | null
  ticker: string | null
  name: string | null
  // The pane's width; the content keeps it while the pane slides in or out.
  width: number
  // A wide window shows the width buttons and the divider; a narrow one gives the chart the
  // whole window.
  wide: boolean
  // The width button that is on: the split's mode (chart/split.ts), or none after a drag between.
  size: SnapMode | null
  onClose: () => void
  onSize: (p: Preset) => void
}

interface Toggles {
  fan: boolean
  peers: boolean
  spy: boolean
  // The volume bars, on unless turned off; kept (prefs.ts).
  volume: boolean
}

type History = { ok: true } | { ok: false; line: string }

// Each company's full-history download, this session, shared by every pane that asks while it
// runs. A failed one is forgotten, so asking again tries again.
const histories = new Map<string, Promise<History>>()
const downloaded = new Set<string>()

const unanswered = (e: unknown): CallResult<never> => ({ ok: false, error: { message: e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.' } })

function downloadHistory(company: string, reportId: string): Promise<History> {
  let asked = histories.get(company)
  if (!asked) {
    asked = window.tearsheet.fetchHistory(reportId).then(
      (reply): History => {
        if (reply.ok) {
          downloaded.add(company)
          return { ok: true }
        }
        const code = reply.error?.code
        const message = reply.error?.message || 'Tearsheet’s engine didn’t answer.'
        // A report running, or past predictions being graded: the engine says when to try again.
        if (code === 'RUN_IN_PROGRESS' || code === 'GRADING_IN_PROGRESS') return { ok: false, line: message }
        return { ok: false, line: `The full price history didn’t download. ${message}` }
      },
      (e: unknown): History => ({ ok: false, line: `The full price history didn’t download. ${unanswered(e).error?.message}` })
    )
    histories.set(company, asked)
    void asked.then((h) => {
      if (!h.ok) histories.delete(company)
    })
  }
  return asked
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const RANGE_WORDS: Record<Range, string> = {
  '1W': '1 week',
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  YTD: 'the year to date',
  '1Y': '1 year',
  '5Y': '5 years',
  All: 'all the history stored'
}

const sgn = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`
const signedMoney = (v: number) => `${v >= 0 ? '+' : '−'}${money.format(Math.abs(v))}`
const dollars = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
const f1 = (v: number) => v.toFixed(1)

const PRESET_WORDS: Record<Preset, string> = { narrow: 'Narrow', half: 'Half', wide: 'Wide', full: 'Full' }

const ICON = {
  close: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// ---------- geometry ----------

const PAD_L = 50
const PAD_R = 14
const AXIS_H = 22
const TOP = 18
// Half the width of the fan's "Next 12 months" heading, at its 11 px.
const FAN_HEAD_HALF = 40

interface Geo {
  W: number
  H: number
  n: number
  x0: number
  x1: number
  plotB: number
  volB: number
  // The volume bars' height: their share of the plot (height.ts), or 0 with Volume off.
  volH: number
  lo: number
  hi: number
  indexed: boolean
  fan: boolean
  // The company's line (its split-adjusted close, or with a compare line on its total return
  // from 100), the compare lines from 100, and a price in the line's units.
  main: number[]
  peers: (number | null)[] | null
  spy: (number | null)[] | null
  scale: (price: number) => number
  X: (j: number) => number
  Y: (v: number) => number
  vmax: number
  bw: number
}

// The price chart and the volume bars together, as height.ts shares them.
const plotHeight = (H: number) => H - TOP - AXIS_H - 12

function geometry(sl: ChartSeries, t: Toggles, W: number, H: number, volH: number): Geo {
  const n = sl.dates.length
  const indexed = t.peers || t.spy
  const fan = t.fan && sl.range !== null
  const fanW = fan ? Math.round((W - PAD_L) * 0.24) : 0
  const x0 = PAD_L
  const x1 = W - PAD_R - fanW - (fan ? 10 : 0)
  const plotB = H - AXIS_H - volH - 12
  const volB = H - AXIS_H
  const total = indexed && sl.total?.length === n ? rebase(sl.total) : null
  const main =
    total && total.every((v) => v !== null)
      ? (total as number[])
      : indexed
        ? sl.close.map((p) => (p / sl.close[0]) * 100)
        : sl.close
  // A price target, as a move from the last close on the line's own basis (the fan).
  const scale = (p: number) => (indexed ? (main[n - 1] * p) / sl.close[n - 1] : p)
  const peers = t.peers ? rebase(sl.peers) : null
  const spy = t.spy ? rebase(sl.spy) : null
  const vals = [...main]
  for (const line of [peers, spy]) line?.forEach((v) => v !== null && vals.push(v))
  if (!indexed && sl.trigger !== null) vals.push(sl.trigger)
  if (fan && sl.range) vals.push(scale(sl.range.bear), scale(sl.range.bull))
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const pad = (hi - lo) * 0.07 || Math.abs(hi) * 0.02 || 1
  lo -= pad
  hi += pad
  const X = (j: number) => (n <= 1 ? (x0 + x1) / 2 : x0 + (j / (n - 1)) * (x1 - x0))
  const Y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (plotB - TOP)
  const vmax = Math.max(0, ...sl.volume)
  // Bars fill their day, with a hairline between them; a few days' bars stay slim.
  const gap = (x1 - x0) / Math.max(1, n)
  const bw = Math.max(1, Math.min(n > 100 ? gap - 0.4 : gap - 1.5, 18))
  return { W, H, n, x0, x1, plotB, volB, volH, lo, hi, indexed, fan, main, peers, spy, scale, X, Y, vmax, bw }
}

// Labels under the chart: each day for a week, every fifth day for a month, month starts up to
// about a year and a half, then year starts. They thin out so they never touch.
function xTicks(dates: string[], X: (j: number) => number): { j: number; text: string }[] {
  const n = dates.length
  const found: { j: number; text: string }[] = []
  if (n <= 8) dates.forEach((d, j) => found.push({ j, text: day(d) }))
  else if (n <= 45) for (let j = n - 1; j >= 0; j -= 5) found.unshift({ j, text: day(dates[j]) })
  else
    dates.forEach((d, j) => {
      if (j === 0) return
      const long = n > 400
      if (long ? d.slice(0, 4) === dates[j - 1].slice(0, 4) : d.slice(0, 7) === dates[j - 1].slice(0, 7)) return
      const month = Number(d.slice(5, 7))
      found.push({ j, text: long ? d.slice(0, 4) : month === 1 ? `Jan ${d.slice(0, 4)}` : MONTHS[month - 1] })
    })
  const out: { j: number; text: string }[] = []
  let lastX = -Infinity
  for (const f of found) {
    const x = X(f.j)
    if (x - lastX >= 52) {
      out.push(f)
      lastX = x
    }
  }
  return out
}

const linePath = (values: (number | null)[], g: Geo): string => {
  let d = ''
  let pen = false
  values.forEach((v, j) => {
    if (v === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${f1(g.X(j))} ${f1(g.Y(v))}`
    pen = true
  })
  return d
}

// ---------- the glide ----------

interface Tracks {
  main: Track | null
  peers: Track | null
  spy: Track | null
}
// A range or toggle change on its way: the lines from where they were to where they go, `t` of
// the way there. `enter` names the parts that weren't there before, which fade in.
interface Glide {
  from: Tracks
  to: Tracks
  t: number
  enter: { peers: boolean; spy: boolean; fan: boolean; price: boolean }
}
// What a glide changes in the drawing.
interface Over extends Tracks {
  main: Track
  ghosts: { cls: string; track: Track }[]
  enter: Glide['enter']
}

function trackOf(values: (number | null)[] | null, g: Geo): Track | null {
  if (!values) return null
  const first = values.findIndex((v) => v !== null)
  let last = -1
  for (let j = values.length - 1; j >= 0; j--)
    if (values[j] !== null) {
      last = j
      break
    }
  if (first < 0 || last <= first) return null
  const ys = resample(
    values.map((_, j) => g.X(j)),
    values.map((v) => (v === null ? null : g.Y(v))),
    g.X(first),
    g.X(last),
    last - first + 1
  )
  return ys ? { xa: g.X(first), xb: g.X(last), ys } : null
}

const tracksOf = (g: Geo): Tracks => ({ main: trackOf(g.main, g), peers: trackOf(g.peers, g), spy: trackOf(g.spy, g) })

const glideNow = (gl: Glide): Tracks => ({
  main: gl.to.main ? glideTrack(gl.from.main, gl.to.main, gl.t) : null,
  peers: gl.to.peers ? glideTrack(gl.from.peers, gl.to.peers, gl.t) : null,
  spy: gl.to.spy ? glideTrack(gl.from.spy, gl.to.spy, gl.t) : null
})

const trackPoints = (t: Track) =>
  trackXs(t)
    .map((x, i) => `${f1(x)},${f1(t.ys[i])}`)
    .join(' ')
const trackPath = (t: Track) =>
  trackXs(t)
    .map((x, i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(t.ys[i])}`)
    .join('')

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------- drawing ----------

// Everything but the hover and the measured stretch, which change as the pointer moves. During
// a glide, `over` gives the lines where they are now, and what fades in or out.
function drawChart(sl: ChartSeries, g: Geo, ticker: string, over: Over | null): ReactElement {
  const { n, X, Y, x0, x1, plotB, volB, W, H } = g
  const ticks = niceTicks(g.lo, g.hi, 5)
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  const priceTick = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: digits ? 2 : 0, maximumFractionDigits: digits ? 2 : 0 })}`

  const volume =
    g.vmax > 0 && g.volH > 0
      ? sl.volume
          .map((v, j) => {
            const h = (v / g.vmax) * g.volH
            // Kept inside the chart at both ends.
            const left = Math.max(x0, X(j) - g.bw / 2)
            const w = Math.min(x1, X(j) + g.bw / 2) - left
            return `M${f1(left)} ${volB}v${f1(-h)}h${f1(w)}v${f1(h)}z`
          })
          .join('')
      : ''

  // The fan, when it is on, runs from fx0 to fx1, with its heading centred above.
  const fx0 = x1 + 10
  const fx1 = W - PAD_R - 42
  const headStart = g.fan && sl.range ? (fx0 + fx1) / 2 - FAN_HEAD_HALF - 4 : Infinity

  // Each filing's line and dot; the 10-K and 10-Q forms are named above, thinned so the names
  // never touch on the longer ranges or run into the fan's heading.
  const marks = sl.filings.map((f) => {
    const j = sl.dates.findIndex((d) => d >= f.date)
    return { x: j < 0 ? null : X(j), form: f.form }
  })
  const shown = namedFilings(marks, headStart)
  const filings = marks.map(({ x, form }, k) => {
    if (x === null) return null
    return (
      <g key={`f${k}`}>
        <line className="c-mkline" x1={x} x2={x} y1={TOP} y2={plotB} />
        <circle className="c-mk" cx={x} cy={plotB + 6} r={form === '8-K' ? 2.5 : 4} />
        {shown[k] && (
          <text className="c-mkl" x={x} y={TOP - 5} textAnchor="middle">
            {form}
          </text>
        )}
      </g>
    )
  })

  const points = over ? trackPoints(over.main) : g.main.map((v, j) => `${f1(X(j))},${f1(Y(v))}`).join(' ')
  const end = g.main[n - 1]
  const endX = over ? over.main.xb : X(n - 1)
  const endY = over ? over.main.ys[over.main.ys.length - 1] : Y(end)
  const enter = (cls: string, on: boolean | undefined) => (on ? `${cls} c-enter` : cls)

  // With a compare line on: each line's name and change at its end, kept apart.
  const ends: ReactElement[] = []
  if (g.indexed) {
    const named: [string, number, string][] = [[ticker, end, 'var(--accent)']]
    const peerEnd = g.peers?.[n - 1]
    const spyEnd = g.spy?.[n - 1]
    if (peerEnd != null) named.push(['Peers', peerEnd, '#8FA2FF'])
    if (spyEnd != null) named.push(['S&P 500', spyEnd, '#D8DCE6'])
    named.sort((a, b) => b[1] - a[1])
    let lastY = -99
    for (const [label, v, colour] of named) {
      let y = Y(v) + 4
      if (y - lastY < 14) y = lastY + 14
      lastY = y
      ends.push(
        <text key={label} className="c-end" x={X(n - 1) - 4} y={y - 8} textAnchor="end" fill={colour}>
          {label} {sgn(v - 100)}
        </text>
      )
    }
  }

  // The 12-month range, ahead of today, on its own time scale.
  let fan: ReactElement | null = null
  if (g.fan && sl.range) {
    const py = Y(end)
    const curve = (target: number) => {
      const out: string[] = []
      for (let q = 0; q <= 12; q++) {
        const f = q / 12
        out.push(`${f1(fx0 + f * (fx1 - fx0))},${f1(Y(end + (g.scale(target) - end) * Math.sqrt(f)))}`)
      }
      return out
    }
    const r = sl.range
    // Each label is two lines; keep them apart, top to bottom.
    const named = ([['Bull', r.bull], ['Base', r.base], ['Bear', r.bear]] as [string, number][]).map(([label, v]) => ({ label, v, y: Y(g.scale(v)) + 4 }))
    named.sort((a, b) => a.y - b.y)
    for (let k = 1; k < named.length; k++) if (named[k].y - named[k - 1].y < 28) named[k].y = named[k - 1].y + 28
    fan = (
      <g className={over?.enter.fan ? 'c-fang c-enter' : 'c-fang'}>
        <line className="c-div" x1={x1 + 5} x2={x1 + 5} y1={TOP} y2={plotB} />
        <text className="c-fanh" x={(fx0 + fx1) / 2} y={TOP - 5} textAnchor="middle">
          Next 12 months
        </text>
        <polygon className="c-fan" points={[...curve(r.bull), ...curve(r.bear).reverse()].join(' ')} />
        <polyline className="c-base" points={curve(r.base).join(' ')} />
        <line className="c-div" x1={x1} x2={fx0} y1={py} y2={py} />
        {named.map(({ label, v, y }) => (
          <g key={label}>
            <text className="c-fanl" x={fx1 + 4} y={y}>
              {label}
            </text>
            <text className="c-fanh" x={fx1 + 4} y={y + 13}>
              {g.indexed ? sgn(g.scale(v) - 100, 0) : dollars(v)}
            </text>
          </g>
        ))}
      </g>
    )
  }

  return (
    <>
      {ticks.map((t) => (
        <g key={`y${t}`}>
          <line className="c-grid" x1={x0} x2={W - PAD_R} y1={Y(t)} y2={Y(t)} />
          <text className="c-labr" x={x0 - 8} y={Y(t) + 4}>
            {g.indexed ? sgn(t - 100, digits) : priceTick(t)}
          </text>
        </g>
      ))}
      {xTicks(sl.dates, X).map(({ j, text }) => (
        <text key={`x${j}`} className="c-lab" x={X(j)} y={H - 6} textAnchor={X(j) > W - PAD_R - 22 ? 'end' : 'middle'}>
          {text}
        </text>
      ))}
      <g className="c-volg">
        <path className="c-vol" d={volume} />
      </g>
      <g className="c-mkg">{filings}</g>
      {!g.indexed && <polygon className={enter('c-area', over?.enter.price)} points={`${f1(over ? over.main.xa : X(0))},${plotB} ${points} ${f1(endX)},${plotB}`} />}
      {over?.ghosts.map(({ cls, track }) => (
        <path key={`gone-${cls}`} className={`${cls} c-leave`} d={trackPath(track)} />
      ))}
      {g.spy && <path className={enter('ln-spy', over?.enter.spy)} d={over?.spy ? trackPath(over.spy) : linePath(g.spy, g)} />}
      {g.peers && <path className={enter('ln-peer', over?.enter.peers)} pathLength={1} d={over?.peers ? trackPath(over.peers) : linePath(g.peers, g)} />}
      <polyline className="c-line" pathLength={1} points={points} />
      {ends}
      {!g.indexed && sl.trigger !== null && (
        <g className={enter('c-buyg', over?.enter.price)}>
          <line className="c-buy" x1={x0} x2={x1} y1={Y(sl.trigger)} y2={Y(sl.trigger)} />
          <text className="c-buyl" x={x0 + 6} y={Y(sl.trigger) - 6}>
            Buy trigger {money.format(sl.trigger)}
          </text>
        </g>
      )}
      {fan}
      <circle cx={endX} cy={endY} r={4} fill="var(--hold)" />
    </>
  )
}

// A day's line, dot, volume bar and note, under the pointer.
function drawHover(sl: ChartSeries, g: Geo, j: number, ticker: string): ReactElement {
  const { X, Y } = g
  const x = X(j)
  const y = Y(g.main[j])
  const value = g.indexed
    ? [
        `${ticker} ${sgn(g.main[j] - 100)}`,
        g.peers?.[j] != null ? `peers ${sgn((g.peers[j] as number) - 100)}` : null,
        g.spy?.[j] != null ? `S&P 500 ${sgn((g.spy[j] as number) - 100)}` : null
      ]
        .filter(Boolean)
        .join(', ')
    : `${money.format(sl.close[j])}  ${sgn(measure(sl.close[0], sl.close[j]).pct)} since ${day(sl.dates[0])}`
  const lines = [shortDate(sl.dates[j]), value, `Volume ${volumeText(sl.volume[j])}`]
  const tw = Math.max(150, Math.max(...lines.map((l) => l.length)) * 6.6 + 24)
  const tx = Math.max(0, x + 12 + tw > g.x1 ? x - 12 - tw : x + 12)
  const ty = Math.max(TOP, Math.min(y - 30, g.plotB - 66))
  const h = g.vmax > 0 ? (sl.volume[j] / g.vmax) * g.volH : 0
  return (
    <g className="c-hovg" aria-hidden="true">
      {h > 0 && <rect className="c-volhi" x={Math.max(g.x0, x - g.bw / 2)} y={g.volB - h} width={Math.min(g.x1, x + g.bw / 2) - Math.max(g.x0, x - g.bw / 2)} height={h} />}
      <line className="c-hov" x1={x} x2={x} y1={TOP} y2={g.volH > 0 ? g.volB : g.plotB} />
      <circle className="c-hdot" cx={x} cy={y} r={5} />
      <rect className="c-tip" x={tx} y={ty} width={tw} height={62} rx={9} />
      <text className="c-tips" x={tx + 11} y={ty + 18}>
        {lines[0]}
      </text>
      <text className="c-tipt" x={tx + 11} y={ty + 36}>
        {lines[1]}
      </text>
      <text className="c-tips" x={tx + 11} y={ty + 53}>
        {lines[2]}
      </text>
    </g>
  )
}

// The price and change above the chart: the last close over the range, a hovered day, or a
// measured stretch. With a compare line on (`total`, the company's line from 100), the change
// is its total return, as the lines show it.
function readout(sl: ChartSeries, range: Range, filled: boolean, hover: number | null, span: { a: number; b: number } | null, total: number[] | null) {
  const n = sl.dates.length
  const move = (a: number, b: number) => (total ? measure(total[a], total[b]) : measure(sl.close[a], sl.close[b]))
  if (span && span.a !== span.b) {
    const a = Math.min(span.a, span.b)
    const b = Math.max(span.a, span.b)
    const m = move(a, b)
    const days = b - a
    return {
      price: money.format(sl.close[b]),
      change: total ? `${sgn(m.pct)} total return` : `${signedMoney(m.change)}, ${sgn(m.pct)}`,
      up: m.change >= 0,
      note: `from ${shortDate(sl.dates[a])} to ${shortDate(sl.dates[b])}, ${days} trading ${days === 1 ? 'day' : 'days'}`
    }
  }
  const i = hover ?? n - 1
  const m = move(0, i)
  const note =
    hover !== null
      ? `on ${shortDate(sl.dates[i])}, since ${shortDate(sl.dates[0])}`
      : filled && range !== 'All'
        ? `over ${RANGE_WORDS[range]}, to ${shortDate(sl.dates[n - 1])}`
        : `since ${shortDate(sl.dates[0])}, to ${shortDate(sl.dates[n - 1])}`
  return { price: money.format(sl.close[i]), change: total ? `${sgn(m.pct)} total return` : sgn(m.pct), up: m.pct >= 0, note }
}

// ---------- the pane ----------

export function ChartPane({ reportId, cik, ticker, name, width, wide, size, onClose, onSize }: ChartPaneProps) {
  const company = cik === null ? `report:${reportId}` : `cik:${cik}`
  const [series, setSeries] = useState<ChartSeries | null>(null)
  // The series on show was read after the company's history download, so a history still
  // short is what the plan serves.
  const [readAfter, setReadAfter] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Settings' "The chart opens on" (prefs.ts).
  const [range, setRange] = useState<Range>(startRange)
  const [toggles, setToggles] = useState<Toggles>(() => ({ fan: false, peers: false, spy: false, volume: volumeOn() }))
  // The volume bars' share of the height, live while the line above them is dragged.
  const [share, setShare] = useState(volumeShare)
  const [sizing, setSizing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [historyLine, setHistoryLine] = useState<string | null>(null)
  // The draw-in plays as the chart opens, until the first range or toggle change; after that
  // the lines glide (glide.ts).
  const [first, setFirst] = useState(true)
  const [glide, setGlide] = useState<Glide | null>(null)
  const glideRef = useRef<Glide | null>(null)
  glideRef.current = glide
  // A range or toggle change is on its way: the next drawing glides to it.
  const pending = useRef(false)
  const lastG = useRef<Geo | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [span, setSpan] = useState<{ a: number; b: number } | null>(null)
  const [box, setBox] = useState({ W: 0, H: 0 })
  const measuring = useRef(false)
  const wrap = useRef<HTMLDivElement>(null)
  const live = useRef(true)
  const rangeNow = useRef(range)
  rangeNow.current = range
  // 5Y or All picked before the stored series arrived: the download starts once it has.
  const waiting = useRef(range === '5Y' || range === 'All')
  // The company's download this pane is waiting on, so it reads the series once when it lands.
  const following = useRef<Promise<History> | null>(null)
  const label = ticker ?? 'This company'

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  // The stored series.
  useEffect(() => {
    let on = true
    setProblem(null)
    const after = downloaded.has(company)
    window.tearsheet.getChart(reportId).then(
      (r) => {
        if (!on) return
        if (r.ok && r.result) {
          setSeries(r.result)
          setReadAfter(after)
        } else setProblem(r.error?.message || 'Tearsheet’s engine didn’t answer.')
      },
      (e: unknown) => {
        if (on) setProblem(unanswered(e).error?.message ?? null)
      }
    )
    return () => {
      on = false
    }
  }, [reportId, attempt])

  // The chart's box, which follows the pane as it is resized.
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const size = () => setBox({ W: Math.floor(el.clientWidth), H: Math.floor(el.clientHeight) })
    size()
    const watch = new ResizeObserver(size)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // Downloaded, read again and still short: 5Y greys out, and All shows what there is.
  const short = series !== null && readAfter && needsHistory(series, '5Y')
  const shown: Range = range === '5Y' && short ? 'All' : range
  const sl = useMemo(() => (series ? slice(series, shown) : null), [series, shown])
  const volH = volumeHeight(share, plotHeight(box.H), toggles.volume)
  const g = useMemo(() => (sl && sl.dates.length > 0 && box.W > 120 && box.H > 140 ? geometry(sl, toggles, box.W, box.H, volH) : null), [sl, toggles, box, volH])
  // A change glides from the lines as they were (or as they are now, mid-glide) to the new ones;
  // a resize, the first drawing, or Reduce motion just draws.
  useLayoutEffect(() => {
    const prev = lastG.current
    lastG.current = g
    if (!g) return
    const changed = pending.current
    pending.current = false
    const to = tracksOf(g)
    const step = nextGlide({ changed, running: glideRef.current !== null, drawn: prev !== null && to.main !== null, reduced: reducedMotion() })
    if (step === 'drop' && glideRef.current) setGlide(null)
    const running = glideRef.current
    if (step === 'retarget' && running && to.main) {
      setGlide({ from: glideNow(running), to, t: 0, enter: running.enter })
      return
    }
    if (step !== 'start' || !prev) return
    const now = glideRef.current
    setGlide({
      from: now ? glideNow(now) : tracksOf(prev),
      to,
      t: 0,
      enter: { peers: !prev.peers && !!g.peers, spy: !prev.spy && !!g.spy, fan: !prev.fan && g.fan, price: prev.indexed && !g.indexed }
    })
  }, [g])
  useEffect(() => {
    if (!glide) return
    const start = performance.now() - glide.t * GLIDE_MS
    let raf = requestAnimationFrame(function step(at: number) {
      const t = Math.min(1, (at - start) / GLIDE_MS)
      setGlide((gl) => (gl && t >= 1 ? null : gl ? { ...gl, t } : gl))
      if (t < 1) raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
    // One loop per glide: a new one starts it again, and its own steps don't.
  }, [glide?.from, glide?.to])
  const over = useMemo((): Over | null => {
    if (!glide) return null
    const now = glideNow(glide)
    if (!now.main) return null
    const ghosts: Over['ghosts'] = []
    if (glide.from.peers && !glide.to.peers) ghosts.push({ cls: 'ln-peer', track: glide.from.peers })
    if (glide.from.spy && !glide.to.spy) ghosts.push({ cls: 'ln-spy', track: glide.from.spy })
    return { main: now.main, peers: now.peers, spy: now.spy, ghosts, enter: glide.enter }
  }, [glide])
  const body = useMemo(() => (sl && g ? drawChart(sl, g, label, over) : null), [sl, g, label, over])

  const restart = () => {
    setHover(null)
    setSpan(null)
    setFirst(false)
    pending.current = true
  }

  // Picking the range already on only retries its history download; it doesn't glide.
  const pick = (next: Range) => {
    if (next !== range) {
      setRange(next)
      restart()
    }
    setHistoryLine(null)
    getHistory(next)
  }

  // The series again, after the company's history download.
  const reread = async () => {
    const again = await window.tearsheet.getChart(reportId).catch(unanswered)
    if (!live.current) return
    if (again.ok && again.result) {
      setSeries(again.result)
      setReadAfter(true)
      if (rangeNow.current === '5Y' && needsHistory(again.result, '5Y')) setRange('All')
      restart()
    } else setHistoryLine(`The history downloaded, but the chart didn’t read it again. ${again.error?.message ?? ''}`.trim())
  }

  // 5Y and All, the first time: download the full history, then read the chart again.
  const getHistory = (next: Range) => {
    const long = next === '5Y' || next === 'All'
    waiting.current = !series && long
    if (!series || downloading || !long) return
    // Downloaded already, but not read since (the reading failed): read it now.
    if (downloaded.has(company)) {
      if (!readAfter) {
        setDownloading(true)
        void reread().finally(() => live.current && setDownloading(false))
      }
      return
    }
    if (!needsHistory(series, next)) return
    setDownloading(true)
    follow(downloadHistory(company, reportId))
  }

  // Waits on the company's download (one this pane started, or one already running when it
  // opened), once, then reads the series again.
  const follow = (download: Promise<History>) => {
    if (following.current === download) return
    following.current = download
    void download.then(async (h) => {
      if (following.current === download) following.current = null
      if (!live.current) return
      if (h.ok) await reread()
      else setHistoryLine(h.line)
      if (live.current) setDownloading(false)
    })
  }

  useEffect(() => {
    if (series && waiting.current) getHistory(rangeNow.current)
    // Only as the series arrives; getHistory reads the rest as it is now.
  }, [series])

  // A download that another pane of this company started (the chart closed and opened again
  // while it ran): read the series again once it lands.
  useEffect(() => {
    const pending = histories.get(company)
    if (pending && !downloaded.has(company)) follow(pending)
    // Once, as the pane opens.
  }, [company])

  const flip = (k: keyof Toggles) => {
    setToggles((t) => {
      if (k === 'volume') setVolumeOn(!t.volume)
      return { ...t, [k]: !t[k] }
    })
    restart()
  }

  // The line between the price chart and the volume bars: dragged, or moved with the arrow keys,
  // it shares the height between them; a double-click puts the share back.
  const shareAt = (clientY: number): number => {
    const el = wrap.current
    if (!el) return share
    const top = clientY - el.getBoundingClientRect().top
    const plotH = plotHeight(box.H)
    return shareFor(volumeHeight(shareFor(box.H - AXIS_H - (top + 6), plotH), plotH, true), plotH)
  }
  const keepShare = (next: number) => {
    const plotH = plotHeight(box.H)
    const fitted = shareFor(volumeHeight(next, plotH, true), plotH)
    setShare(fitted)
    setVolumeShare(fitted)
  }
  const onSizeDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSizing(true)
    setHover(null)
  }
  const onSizeMove = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (sizing) setShare(shareAt(e.clientY))
  }
  const onSizeUp = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (!sizing) return
    setSizing(false)
    keepShare(shareAt(e.clientY))
  }
  const onSizeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    keepShare(share + (e.key === 'ArrowUp' ? 0.02 : -0.02))
  }

  // The day under the pointer; while measuring, the nearest day inside the chart.
  const at = (clientX: number, clamp: boolean): number | null => {
    const el = wrap.current
    if (!g || !el) return null
    const x = clientX - el.getBoundingClientRect().left
    if (!clamp && (x < g.x0 - 12 || x > g.x1 + 12)) return null
    if (g.n <= 1) return 0
    return Math.max(0, Math.min(g.n - 1, Math.round(((x - g.x0) / (g.x1 - g.x0)) * (g.n - 1))))
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const j = at(e.clientX, measuring.current)
    if (measuring.current && j !== null) setSpan((s) => (s ? { ...s, b: j } : s))
    setHover(j)
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const j = at(e.clientX, false)
    if (j === null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    measuring.current = true
    setSpan({ a: j, b: j })
  }
  const onUp = () => {
    if (!measuring.current) return
    measuring.current = false
    // A click without a drag clears the measure.
    setSpan((s) => (s && s.a === s.b ? null : s))
  }
  const onLeave = () => {
    if (!measuring.current) setHover(null)
  }

  const long = shown === '5Y' || shown === 'All'
  // A download covers the chart only while 5Y or All is shown; the shorter ranges stay usable.
  const loading = downloading && long
  const noPeers = !series || series.peers.every((v) => v === null)
  const noSpy = !series || series.spy.every((v) => v === null)
  const served = series ? `Massive’s free plan serves ${yearsServed(series)} for this company.` : ''
  const read = sl && sl.dates.length > 0 && series ? readout(sl, shown, covers(series, shown), hover, span, g?.indexed ? g.main : null) : null

  const subtitle = `${name ? `${name}, ` : ''}${toggles.peers || toggles.spy ? 'total return, with dividends' : 'daily close, adjusted for splits'}`

  const toggle = (k: keyof Toggles, text: string, colour: string, off: boolean, why: string) => (
    <button className={toggles[k] ? 'tg on' : 'tg'} aria-pressed={toggles[k]} disabled={off} title={off ? why : undefined} onClick={() => flip(k)}>
      <i style={{ background: colour }} />
      {text}
    </button>
  )

  let inside: ReactElement | null = null
  if (problem)
    inside = (
      <div className="cmsg" role="alert">
        <p>The price chart didn’t load. {problem}</p>
        <button className="plain" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    )
  else if (!series) inside = <div className="skel" aria-label="Loading the price chart" />
  else if (loading)
    inside = (
      <>
        <div className="skel" />
        <div className="loadbox" role="status">
          <b>Downloading the full price history…</b>
          <span>A few calls to Massive, the first time only. It can take about a minute.</span>
          <div className="bar5" />
        </div>
      </>
    )
  else if (series.dates.length === 0) inside = <div className="cmsg"><p>No daily prices are stored for this company yet.</p></div>
  else if (g && sl)
    inside = (
      <svg width={g.W} height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`${label} daily price, ${shown}`}>
        <defs>
          <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7FE3F7" stopOpacity=".18" />
            <stop offset="1" stopColor="#7FE3F7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fan-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8FA2FF" stopOpacity=".05" />
            <stop offset="1" stopColor="#8FA2FF" stopOpacity=".24" />
          </linearGradient>
        </defs>
        {span && span.a !== span.b && (
          <g aria-hidden="true">
            <rect className="c-meas" x={Math.min(g.X(span.a), g.X(span.b))} y={TOP} width={Math.abs(g.X(span.b) - g.X(span.a))} height={g.plotB - TOP} />
            <line className="c-measl" x1={g.X(span.a)} x2={g.X(span.a)} y1={TOP} y2={g.plotB} />
            <line className="c-measl" x1={g.X(span.b)} x2={g.X(span.b)} y1={TOP} y2={g.plotB} />
          </g>
        )}
        <g className={first ? 'play first' : 'play'}>
          {body}
        </g>
        {hover !== null && hover < g.n && drawHover(sl, g, hover, label)}
      </svg>
    )

  return (
    <section className={width < 760 ? 'cpane narrowp' : 'cpane'} style={{ width }} aria-label="Price chart">
      <div className="cpin" style={{ width }}>
        <div className="cph">
          <div className="cpt">
            <b>{ticker ?? 'Price'}</b>
            <span title={subtitle}>{subtitle}</span>
          </div>
          <div className="cpbig">
            {loading ? (
              <>
                <b>…</b>
                <small>getting the full history</small>
              </>
            ) : read ? (
              <>
                <b>{read.price}</b>
                <em className={read.up ? 'up' : 'dn'}>{read.change}</em>
                <small>{read.note}</small>
              </>
            ) : null}
          </div>
          <div className="cpctl">
            <div className="segc" role="group" aria-label="Range">
              {RANGE_ORDER.map((r) => {
                const off = r === '5Y' && short
                return (
                  <button key={r} className={shown === r ? 'on' : ''} aria-pressed={shown === r} disabled={off} title={off ? served : undefined} onClick={() => pick(r)}>
                    {r}
                  </button>
                )
              })}
            </div>
            {toggle('fan', '12-month range', '#8FA2FF', !series?.range, 'This report has no 12-month range.')}
            {toggle('peers', 'Peers', '#8FA2FF', noPeers, 'No peer prices are stored for this report.')}
            {toggle('spy', 'S&P 500', '#D8DCE6', noSpy, 'No S&P 500 prices are stored.')}
            {toggle('volume', 'Volume', 'rgba(127, 227, 247, .45)', false, '')}
            {wide && (
              <div className="segc cwid" role="group" aria-label="Chart width">
                {PRESETS.map((p) => (
                  <button key={p} className={size === p ? 'on' : ''} aria-pressed={size === p} onClick={() => onSize(p)}>
                    {PRESET_WORDS[p]}
                  </button>
                ))}
              </div>
            )}
            <button className="ibtn" aria-label="Close the chart" title="Close the chart (⌘3)" onClick={onClose}>
              {ICON.close}
            </button>
          </div>
        </div>
        {long && !loading && historyLine && <p className="cline">{historyLine}</p>}
        {shown === 'All' && short && <p className="cnote5">{served}</p>}
        <div ref={wrap} className="chartwrap" onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp} onPointerLeave={onLeave}>
          {inside}
          {g && sl && !loading && g.volH > 0 && (
            <div
              className={sizing ? 'hsplit hot' : 'hsplit'}
              style={{ left: g.x0, width: g.x1 - g.x0, top: g.plotB }}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Price and volume heights"
              aria-valuenow={Math.round(share * 100)}
              tabIndex={0}
              title="Drag to give the price or the volume more room. Double-click to reset."
              onPointerDown={onSizeDown}
              onPointerMove={onSizeMove}
              onPointerUp={onSizeUp}
              onPointerCancel={onSizeUp}
              onDoubleClick={() => keepShare(SHARE_DEFAULT)}
              onKeyDown={onSizeKey}
            >
              <i />
            </div>
          )}
        </div>
        <div className="cfoot">
          <span>
            <i style={{ background: 'var(--accent)' }} />
            {name ?? label}
          </span>
          {toggles.peers && (
            <span>
              <i style={{ background: '#8FA2FF' }} />
              Peers, equal-weighted
            </span>
          )}
          {toggles.spy && (
            <span>
              <i style={{ background: '#D8DCE6' }} />
              S&amp;P 500
            </span>
          )}
          <span>
            <i className="dot" />
            SEC filings the report read
          </span>
          <span>{wide ? 'Hover for a day; drag across to measure; drag the divider to resize.' : 'Hover for a day; drag across to measure.'}</span>
        </div>
      </div>
    </section>
  )
}
