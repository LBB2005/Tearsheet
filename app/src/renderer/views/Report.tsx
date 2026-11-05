import { useEffect, useState } from 'react'

import type { ReportResult, ReportSummary } from '../../shared/protocol'

export function Report({ openId, onOpen }: { openId: string | null; onOpen: (id: string) => void }) {
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [report, setReport] = useState<ReportResult | null>(null)
  const [flag, setFlag] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.tearsheet.listReports().then((r) => r.ok && r.result && setReports(r.result))
  }, [openId])
  useEffect(() => {
    if (!openId) return
    void window.tearsheet.getReport(openId).then((r) => setReport(r.ok && r.result ? r.result : null))
  }, [openId])
  useEffect(
    () =>
      window.tearsheet.onFlagRequested(({ claimId }) => {
        setFlag(claimId)
        setNote('')
      }),
    []
  )
  useEffect(
    () =>
      window.tearsheet.onNotification((n) => {
        if (n.method === 'reread_done') setMessage(`Saved evidence for ${n.params.accession} was cleared; the next report re-reads the filing.`)
      }),
    []
  )

  const sendFlag = async () => {
    if (!report || !flag) return
    const reply = await window.tearsheet.flagClaim(`${report.report_id}:${flag}`, note)
    setMessage(reply.ok ? `Flagged ${flag}. Resolve it in the next spot-check.` : reply.error?.message ?? 'Flag not saved.')
    setFlag(null)
  }

  return (
    <div className="report">
      <ul>
        {reports.length === 0 && <li className="muted">No reports yet.</li>}
        {reports.map((r) => (
          <li key={r.report_id}>
            <button className={r.report_id === openId ? 'on' : ''} onClick={() => onOpen(r.report_id)}>
              {r.ticker ?? '?'} · {r.rating ?? 'withheld'}
              <br />
              <span className="muted">{new Date(r.created_at).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        {message && <p className="notice">{message}</p>}
        {report ? (
          // An empty sandbox: no scripts, forms, pop-ups or top-level navigation (Technical Plan §12).
          <iframe className="report-frame" title="Report" sandbox="" srcDoc={report.html} />
        ) : (
          <p className="muted">Pick a report.</p>
        )}
      </div>
      {flag && (
        <div className="modal">
          <div>
            <strong>Flag this claim ({flag})</strong>
            <textarea rows={4} placeholder="What looks wrong?" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row">
              <button className="primary" onClick={() => void sendFlag()}>
                Save flag
              </button>
              <button className="plain" onClick={() => setFlag(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
