// The Tearsheet app icon (the Fan), drawn as SVG so it can move. "intro" plays the opening once
// per launch; "run" follows a report's 14 steps and plays the "report ready" moment at the end.
// It is plain SVG and CSS, so it needs nothing beyond the window's content-security policy, and
// fan.css stops all motion under macOS Reduce motion. The drawing matches app/build/icon/icon.svg.

import './fan.css'

import { useId, useRef, useState, type CSSProperties } from 'react'

import type { StepStates } from '../../shared/steps'
import { fanPicture } from './picture'

// Apple's continuous-corner icon square on the 1024 grid: a superellipse, exponent 5.
function squircle(cx = 512, cy = 512, size = 824, n = 5, steps = 256): string {
  const a = size / 2
  const points: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)
    const y = cy + a * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return `M${points.join('L')}Z`
}

const SQ = squircle()
const TODAY = '500 540'
const TIPS = { bull: [772, 326], base: [772, 482], bear: [772, 734] } as const
const HIST = 'M236 640L300 596L348 622L404 560L452 586L500 540'
const BRACKETS = [
  [206, 206, 1, 1],
  [818, 206, -1, 1],
  [206, 818, 1, -1],
  [818, 818, -1, -1]
].map(([x, y, dx, dy]) => `M${x} ${y + dy * 96}L${x} ${y}L${x + dx * 96} ${y}`)

// How long the Progress view holds the "report ready" moment before the report opens.
export function readyPauseMs(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1600
}

let introPlayed = false

type Props = { size: number; className?: string } & (
  | { mode: 'intro' }
  | { mode: 'run'; steps: StepStates; ready: boolean; failed: boolean }
)

export function FanMark(props: Props) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '')
  const [intro] = useState(() => {
    if (props.mode !== 'intro' || introPlayed) return false
    introPlayed = true
    return true
  })
  // The ready moment plays only when a run finishes in front of you, not when you come back to it.
  const readyAtStart = useRef(props.mode === 'run' && props.ready)

  const classes = ['fm']
  let vars: CSSProperties = {}
  if (props.mode === 'intro') {
    if (intro) classes.push('fm-intro')
  } else {
    const p = fanPicture(props.steps, { ready: props.ready, failed: props.failed })
    classes.push('fm-run')
    if (p.today) classes.push('has-today')
    if (p.tips) classes.push('tips')
    if (p.locked) classes.push('locked')
    if (p.working) classes.push('working')
    if (p.failed) classes.push('failed')
    if (p.locked && !readyAtStart.current) classes.push('fm-ready')
    vars = { '--hist': p.hist.toFixed(3), '--fan': p.fan.toFixed(3) } as CSSProperties
  }
  if (props.className) classes.push(props.className)

  const ref = (name: string) => `url(#${id}${name})`
  const path = (k: keyof typeof TIPS) => `M${TODAY}L${TIPS[k].join(' ')}`
  return (
    <svg className={classes.join(' ')} style={{ width: props.size, height: props.size, ...vars }} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17283F" />
          <stop offset=".55" stopColor="#0A1526" />
          <stop offset="1" stopColor="#050A13" />
        </linearGradient>
        <radialGradient id={`${id}gl`} cx="560" cy="520" r="400" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5CC8FF" stopOpacity=".24" />
          <stop offset="1" stopColor="#5CC8FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".26" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#fff" stopOpacity=".10" />
        </linearGradient>
        <linearGradient id={`${id}fb`} x1="0" x2="1">
          <stop offset="0" stopColor="#6FE7FF" stopOpacity=".04" />
          <stop offset="1" stopColor="#6FE7FF" stopOpacity=".26" />
        </linearGradient>
        <linearGradient id={`${id}sc`} x1="0" x2="1">
          <stop offset="0" stopColor="#6FE7FF" stopOpacity="0" />
          <stop offset=".8" stopColor="#6FE7FF" stopOpacity=".16" />
          <stop offset="1" stopColor="#BFF6FF" stopOpacity=".5" />
        </linearGradient>
        <clipPath id={`${id}clip`}>
          <path d={SQ} />
        </clipPath>
        <filter id={`${id}blur`} filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>
      <path d={SQ} fill={ref('bg')} />
      <g clipPath={ref('clip')}>
        <rect width="1024" height="1024" fill={ref('gl')} />
        <g className="fm-brk">
          {BRACKETS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <rect className="fm-scan" x="206" y="214" width="120" height="596" fill={ref('sc')} />
        <path className="fm-band" d={`M${TODAY}L${TIPS.bull.join(' ')}L${TIPS.bear.join(' ')}Z`} fill={ref('fb')} />
        <path className="fm-p fm-bull" d={path('bull')} pathLength={1} />
        <path className="fm-p fm-base" d={path('base')} pathLength={1} />
        <path className="fm-p fm-bear" d={path('bear')} pathLength={1} />
        {(['bull', 'base', 'bear'] as const).map((k) => (
          <circle key={k} className={`fm-tip fm-tip-${k}`} cx={TIPS[k][0]} cy={TIPS[k][1]} r="22" />
        ))}
        <path className="fm-hglow" d={HIST} pathLength={1} filter={ref('blur')} />
        <path className="fm-hist" d={HIST} pathLength={1} />
        <circle className="fm-pulse" cx="500" cy="540" r="44" />
        <g className="fm-today">
          <circle cx="500" cy="540" r="84" fill="#FFB547" opacity=".45" filter={ref('blur')} />
          <circle cx="500" cy="540" r="44" fill="#FFB547" stroke="#0A1526" strokeWidth="14" />
        </g>
        <path d={SQ} fill="none" stroke={ref('rim')} strokeWidth="9" />
      </g>
    </svg>
  )
}
