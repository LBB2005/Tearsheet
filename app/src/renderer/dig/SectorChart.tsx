// Dig deeper's sector chart: the stock, its S&P 500 sector (equal-weighted) and SPY over the last
// 12 months, each 100 at the start (the engine's dig/sector.py lines).

import type { DigSector } from '../../shared/protocol'
import { niceTicks } from '../chart/series'
import { shortDate } from '../nav'

const W = 720
const H = 220
const L = 40
const R = 12
const T = 10
const B = 24

export function SectorChart({ part, ticker, label }: { part: DigSector; ticker: string; label: string }) {
  const lines = [
    { key: 'stock', name: ticker, values: part.stock },
    { key: 'sector', name: part.sector ?? 'Sector', values: part.sector_line },
    { key: 'spy', name: 'SPY', values: part.spy }
  ]
  const all = lines.flatMap((l) => l.values).filter((v): v is number => v !== null && Number.isFinite(v))
  const n = part.dates.length
  if (n < 2 || !all.length) return null
  const ticks = niceTicks(Math.min(...all, 100), Math.max(...all, 100), 4)
  const lo = Math.min(ticks[0], ...all)
  const hi = Math.max(ticks[ticks.length - 1], ...all)
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B)
  const path = (values: (number | null)[]) => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null) return void (pen = false)
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  return (
    <figure className="dchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t} className={t === 100 ? 'grid base' : 'grid'}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 6} y={y(t) + 4}>
              {t}
            </text>
          </g>
        ))}
        <text className="when" x={L} y={H - 6}>
          {shortDate(part.dates[0])}
        </text>
        <text className="when end" x={W - R} y={H - 6}>
          {shortDate(part.dates[n - 1])}
        </text>
        {lines.map((l) => (
          <path key={l.key} className={`ln ${l.key}`} d={path(l.values)} />
        ))}
      </svg>
      <figcaption>
        {lines.map((l) => (
          <span key={l.key} className={`key ${l.key}`}>
            <i aria-hidden="true" />
            {l.name}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
