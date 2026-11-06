// The prediction log (the spec's "Prediction log"), in look C: the "descriptive, not conclusive"
// notice, three tiles, and the table of logged reports with their grades. Until something is
// graded it says so plainly. There are no stripes and no example rows: only real predictions and
// real grades show. Ported from docs/designs/report-look-c-chart-split.html (logPage) without
// its example panels. Replaces views/Log.tsx.

import '../log/log.css'

import { useEffect, useRef, useState } from 'react'

import type { CallResult } from '../../preload/api'
import type { GradeResult, PredictionSummary } from '../../shared/protocol'
import { gradeCells, gradedLine, logSubtitle, logTiles, ratingTone } from '../log/log'
import { shortDate } from '../nav'
import { at, Changes, Spinner } from '../setup/parts'
import { money } from '../shell/Sidebar'

export interface LogProps {
  // Past predictions being graded, from the app's launch or from Grade what is due here. The
  // sidebar's status line says "Grading past predictions" meanwhile.
  grading: boolean
  // Changes each time grading finishes, so the predictions are read again.
  refresh: number
  // Grades whatever is due (App's gradeDue), with the engine's answer.
  onGrade: () => Promise<CallResult<GradeResult> | null>
  // The toolbar's line under the title.
  onSubtitle: (text: string) => void
}

const price = (v: number | null) => (v === null ? '—' : money.format(v))

export function Log({ grading, refresh, onGrade, onSubtitle }: LogProps) {
  const [rows, setRows] = useState<PredictionSummary[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const subtitle = useRef(onSubtitle)
  subtitle.current = onSubtitle

  useEffect(() => {
    let live = true
    window.tearsheet.listPredictions().then(
      (r) => {
        if (!live) return
        if (r.ok && r.result) {
          setRows(r.result)
          setFailed(null)
          subtitle.current(logSubtitle(r.result))
        } else setFailed(r.error?.message || 'Tearsheet’s engine didn’t answer.')
      },
      (e: unknown) => live && setFailed(e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
    )
    return () => {
      live = false
    }
  }, [refresh])

  const grade = async () => {
    if (grading) return
    setLine(null)
    setLine(gradedLine(await onGrade()))
  }

  if (!rows) {
    return (
      <div className="logv panels">
        {failed ? (
          <p className="notice error mv" role="alert">
            The prediction log didn’t load. {failed}
          </p>
        ) : (
          <p className="loading">Loading the prediction log…</p>
        )}
      </div>
    )
  }

  const now = new Date()
  const tiles = logTiles(rows, now)
  const anyGraded = rows.some((p) => p.grades.length > 0)
  const head = (
    <h4>
      <span>Logged reports</span>
      <button className="btn2" disabled={grading} onClick={() => void grade()}>
        {grading ? (
          <>
            <Spinner />
            Grading…
          </>
        ) : (
          'Grade what is due'
        )}
      </button>
    </h4>
  )
  const said = line && !grading && (
    <Changes k={line} className="gline" live>
      {line}
    </Changes>
  )

  return (
    <div className="logv panels">
      <div className="notice mv" style={at(0)}>
        <b>Descriptive, not conclusive.</b> This log grades the companies you chose to look up, not the method as a whole.
      </div>
      <div className="tiles3 mv" style={at(1)}>
        {tiles.map((t) => (
          <section key={t.text} className="p glass stat">
            <b>{t.big}</b>
            <span>{t.text}</span>
          </section>
        ))}
      </div>
      {rows.length === 0 ? (
        <section className="p glass mv" style={at(2)}>
          {head}
          {said}
          <div className="empty">
            <b>No official predictions yet</b>
            <span>Each company’s first full report in any 30 days is logged here, and graded at 3, 6 and 12 months.</span>
          </div>
        </section>
      ) : (
        <section className="p glass mv" style={at(2)}>
          {head}
          {said}
          <table className="t">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Rating</th>
                <th className="r">Bear</th>
                <th className="r">Base</th>
                <th className="r">Bull</th>
                <th>Grades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const cells = gradeCells(p, now)
                return (
                  <tr key={p.prediction_id}>
                    <td>{shortDate(p.run_at.slice(0, 10), now)}</td>
                    <td className="tk">{p.ticker}</td>
                    <td>
                      <span className={`pill ${ratingTone(p.rating)}`}>{p.rating}</span>
                    </td>
                    <td className="r">{price(p.bear)}</td>
                    <td className="r">{price(p.base)}</td>
                    <td className="r">{price(p.bull)}</td>
                    <td className="grades">
                      {cells.graded.map((g) => (
                        <div key={g.months} className="gr">
                          <span className="gm">{g.label}</span>
                          <span className={`pill ${g.verdict === 'hit' ? 'ok' : g.verdict === 'miss' ? 'bad' : 'off'}`}>{g.text}</span>
                          {g.detail && <span className="gd">{g.detail}</span>}
                        </div>
                      ))}
                      {cells.next && <span className="pill off">{cells.next}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
      {rows.length > 0 && !anyGraded && (
        <section className="p glass mv" style={at(3)}>
          <div className="empty">
            <b>Nothing graded yet</b>
            <span>Each grade shows in the table as it comes in: a hit or a miss for the rating against the company’s peers, and whether the price ended inside the report’s range.</span>
          </div>
        </section>
      )}
    </div>
  )
}
