// The Tearsheet app icon ("Glass"): a dark glass tile with two grey lines of text and a cyan
// rising price line. markSvg() builds the SVG as a string, from the same path data as
// app/build/icon/icon.svg (full) and icon-small.svg (16 and 32 px); the icon files are written
// from this function, so the in-app mark and the Dock icon cannot drift apart. With `fill`, the
// price line draws in over a dim track, which is how a report's 14 steps show their progress.

import { REPORT_STEPS, stepsBehind, type StepStates } from '../../shared/steps'

// Apple's continuous-corner icon square on the 1024 grid: a superellipse, exponent 5, 824 wide.
function squircle(cx = 512, cy = 512, size = 824, n = 5, steps = 200): string {
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

export interface MarkOptions {
  small?: boolean
  // 0–1: how much of the price line is drawn. Left out, the line is drawn in full.
  fill?: number
  // Prefix for the gradient and clip ids, so several marks on one page do not collide.
  id?: string
}

// The share of a report's 14 steps that are behind it (the same count the Dock progress bar uses).
export function fillForSteps(steps: StepStates): number {
  return stepsBehind(steps) / REPORT_STEPS.length
}

const line = (d: string, w: number, color: string) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`

function chart(d: string, w: number, color: string, p: number | undefined, track: string): string {
  const base = `d="${d}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`
  if (p === undefined) return `<path ${base} stroke="${color}"/>`
  const offset = (1 - Math.min(1, Math.max(0, p))).toFixed(3)
  return (
    `<path ${base} stroke="${track}"/>` +
    `<path class="mark-fill" ${base} pathLength="1" stroke="${color}" stroke-dasharray="1 1" stroke-dashoffset="${offset}"/>`
  )
}

export function markSvg(opts: MarkOptions): string {
  const { small = false, fill } = opts
  const id = opts.id ?? 'mk'
  const d = small ? 'M290 724L428 592L530 664L742 440' : 'M300 700L420 594L512 660L740 446'
  const x1 = small ? 742 : 740
  const x0 = small ? 290 : 300
  const area = `${d}L${x1} 930L${x0} 930Z`
  const areaOpacity = fill === undefined ? '' : ` class="mark-area" opacity="${Math.min(1, Math.max(0, fill)).toFixed(3)}"`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" aria-hidden="true">` +
    `<defs><clipPath id="${id}-c"><path d="${SQ}"/></clipPath>` +
    `<linearGradient id="${id}-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2E44"/><stop offset=".55" stop-color="#0B1626"/><stop offset="1" stop-color="#060B14"/></linearGradient>` +
    `<radialGradient id="${id}-g" cx="700" cy="720" r="460" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5CC8FF" stop-opacity=".2"/><stop offset="1" stop-color="#5CC8FF" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${id}-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FE3F7" stop-opacity=".26"/><stop offset=".7" stop-color="#7FE3F7" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${id}-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".45" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient></defs>` +
    `<path d="${SQ}" fill="url(#${id}-b)"/>` +
    `<g clip-path="url(#${id}-c)"><rect width="1024" height="1024" fill="url(#${id}-g)"/>` +
    (small ? line('M290 352H630', 70, '#7487A0') : line('M300 346H600', 40, '#7487A0') + line('M300 448H484', 40, '#7487A0')) +
    `<path d="${area}" fill="url(#${id}-a)"${areaOpacity}/>` +
    chart(d, small ? 80 : 44, '#8EEFFF', fill, 'rgba(142,239,255,.16)') +
    `<path d="${SQ}" fill="none" stroke="url(#${id}-r)" stroke-width="${small ? 36 : 20}"/></g></svg>`
  )
}
