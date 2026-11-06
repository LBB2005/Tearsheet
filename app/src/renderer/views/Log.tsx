import { useEffect, useState } from 'react'

import type { Grade, PredictionSummary } from '../../shared/protocol'

const money = (v: number | null) => (v === null ? '—' : `$${v.toFixed(2)}`)
const pct = (v: number | null) => (v === null ? '' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)

// Each horizon's grade under the newest grading rules (older versions stay in the database).
function latest(grades: Grade[]): Grade[] {
  const by = new Map<number, Grade>()
  for (const g of grades) {
    const seen = by.get(g.horizon_months)
    if (!seen || g.grading_version > seen.grading_version) by.set(g.horizon_months, g)
  }
  return [...by.values()].sort((a, b) => a.horizon_months - b.horizon_months)
}

function describe(g: Grade): string {
  const verdict = g.hit === null ? 'no peer data' : g.hit ? 'hit' : 'miss'
  const range = g.inside_range === null ? '' : g.inside_range ? ', inside range' : ', outside range'
  return `${g.horizon_months}m: ${verdict} (${pct(g.excess)} vs peers${range})`
}

export function Log() {
  const [rows, setRows] = useState<PredictionSummary[] | null>(null)
  const [graded, setGraded] = useState<string | null>(null)

  const load = () => window.tearsheet.listPredictions().then((r) => setRows(r.ok && r.result ? r.result : []))

  useEffect(() => {
    void load()
  }, [])

  const gradeNow = async () => {
    setGraded('Grading…')
    const r = await window.tearsheet.gradeDue()
    if (r.ok && r.result) {
      setGraded(`Graded ${r.result.graded} new horizons.${r.result.note ? ` ${r.result.note}` : ''}`)
    } else {
      setGraded(r.error?.message ?? 'Grading failed.')
    }
    await load()
  }

  return (
    <section>
      <h2>Prediction log</h2>
      <p className="notice">Descriptive, not conclusive. This log grades the companies you chose to look up, not the method as a whole.</p>
      <p>
        <button onClick={() => void gradeNow()}>Grade what is due</button> {graded && <span className="muted">{graded}</span>}
      </p>
      {rows && rows.length === 0 && <p className="muted">No official predictions yet. Logging is switched on once the full method is finished.</p>}
      {rows && rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Date</th><th>Ticker</th><th>Rating</th><th>Bear</th><th>Base</th><th>Bull</th><th>Grades</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.prediction_id}>
                <td>{new Date(p.run_at).toLocaleDateString()}</td>
                <td>{p.ticker}</td>
                <td>{p.rating}</td>
                <td>{money(p.bear)}</td>
                <td>{money(p.base)}</td>
                <td>{money(p.bull)}</td>
                <td>{p.grades.length ? latest(p.grades).map(describe).join('; ') : 'not due yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
