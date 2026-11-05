import { useEffect, useState } from 'react'

import type { PredictionSummary } from '../../shared/protocol'

const money = (v: number | null) => (v === null ? '—' : `$${v.toFixed(2)}`)

export function Log() {
  const [rows, setRows] = useState<PredictionSummary[] | null>(null)
  useEffect(() => {
    void window.tearsheet.listPredictions().then((r) => setRows(r.ok && r.result ? r.result : []))
  }, [])
  return (
    <section>
      <h2>Prediction log</h2>
      <p className="notice">Descriptive, not conclusive. This log grades the companies you chose to look up, not the method as a whole.</p>
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
                <td>{p.grades.length ? `${p.grades.length} graded` : 'not due yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
