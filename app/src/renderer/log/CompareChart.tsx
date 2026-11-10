// The prediction log's compare chart: the ticked companies against the S&P 500 (log/compare.ts
// works the lines out). Colours are the app's names, so every look and light mode work.

import { COMPARE_RANGES, plot, type CompareRange, type CompareSeries } from './compare'
import { signedPct } from './screen'
import { shortDate } from '../nav'
import { Spinner } from '../setup/parts'

const W = 730
const H = 200

export interface CompareChartProps {
  series: CompareSeries
  range: CompareRange
  loading: boolean
  // The lines shown are the last chart's, kept up while the new prices load.
  stale?: boolean
  picked: number
  onRange: (range: CompareRange) => void
  onRemove: (key: string) => void
}

export function CompareChart({ series, range, loading, stale = false, picked, onRange, onRemove }: CompareChartProps) {
  const drawn = plot(series, W, H, (x) => (x.startsWith('day ') ? x : shortDate(x)))
  return (
    <section className={stale ? 'p glass mv compare stale' : 'p glass mv compare'} aria-label="Compare" aria-busy={loading}>
      <h4>
        <span>
          {range === 'since' ? 'Lead over the S&P 500 since each prediction' : '% return against the S&P 500'} · {picked} of 6 ticked
          {loading && <Spinner />}
        </span>
        <span className="chips" role="group" aria-label="Range">
          {COMPARE_RANGES.map(([key, label]) => (
            <button key={key} type="button" className={`chip${range === key ? ' on' : ''}`} aria-pressed={range === key} onClick={() => onRange(key)}>
              {label}
            </button>
          ))}
        </span>
      </h4>
      {series.empty || drawn.paths.length === 0 ? (
        <p className={loading ? 'cempty loading' : 'cempty'}>{loading ? 'Loading prices…' : series.empty}</p>
      ) : (
        <svg viewBox={`0 0 ${W + 56} ${H + 34}`} className="cplot" role="img" aria-label={`${series.lines.map((l) => l.label).join(', ')}: ${range === 'since' ? 'lead over the S&P 500' : 'percent return'}`}>
          <g transform="translate(46 8)">
            {drawn.yTicks.map((t) => (
              <g key={t.label}>
                <line className={t.zero ? 'gz' : 'gy'} x1={0} x2={W} y1={t.y} y2={t.y} />
                <text className="gl" x={-8} y={t.y} dy={4} textAnchor="end">
                  {t.label}
                </text>
              </g>
            ))}
            {drawn.paths.map((p) => (
              <path key={p.key} d={p.d} className={p.spy ? 'spy' : 'line'} style={{ stroke: p.colour }} />
            ))}
            {drawn.xTicks.map((t, i) => (
              <text key={i} className="gl" x={t.x} y={H + 20} textAnchor={t.anchor}>
                {t.label}
              </text>
            ))}
          </g>
        </svg>
      )}
      {series.lines.length > 0 && (
        <ul className="legend">
          {series.lines.map((l) => (
            <li key={l.key}>
              <i className={l.spy ? 'spy' : undefined} style={{ color: l.colour }} aria-hidden="true" />
              <b>{l.label}</b>
              <span className={l.last === null ? '' : l.last >= 0 ? 'up' : 'down'}>{signedPct(l.last, 1)}</span>
              {!l.spy && (
                <button type="button" className="x" aria-label={`Remove ${l.label} from the chart`} onClick={() => onRemove(l.key)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
