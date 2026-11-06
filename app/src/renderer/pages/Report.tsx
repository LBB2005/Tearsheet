// The report page (the spec's "Pages → 1. Report"). The report itself stays the engine's HTML in
// a sandboxed frame: its numbers column, its Summary / Full switch and its section links are the
// engine's (same-page links and CSS, no scripts). Around it, the app adds the toolbar's parts:
// the company's other reports under the subtitle, the Numbers / Text switch while the chart is
// open, and the Chart button (⌘3). The chart pane is a placeholder until the chart split lands.
// The state lives in report/useReport.ts.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { ReportSummary } from '../../shared/protocol'
import type { ReportPage } from '../report/useReport'
import { reportChoice } from '../report/view'

import '../report/report.css'

const CHART_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 17l5-6 4 4 7-9" />
    <path d="M3 21h18" />
  </svg>
)

const CHEVRON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 10l5 5 5-5" />
  </svg>
)

export function Report({ page }: { page: ReportPage }) {
  const { report, frame, error, chartOpen } = page
  return (
    <div className={chartOpen ? 'rpage chartopen' : 'rpage'}>
      <div className="rmain">
        {error && (
          <div className="notice error rerror" role="alert">
            <span>
              <b>The report didn’t open.</b> {error}
            </span>
            <button className="plain" onClick={() => page.show(page.view)}>
              Try again
            </button>
          </div>
        )}
        {report && (
          <div key={frame} className="rframe">
            {/* An empty sandbox: no scripts, forms, pop-ups or top-level navigation (Technical Plan §12). */}
            <iframe className="report-frame" title="Report" sandbox="" srcDoc={report.html} />
          </div>
        )}
      </div>
      {chartOpen && (
        <section className="cpane0" aria-label="Price chart">
          <p>The price chart will show here.</p>
        </section>
      )}
    </div>
  )
}

// The toolbar's right side on the report page: the Numbers / Text switch while the chart is open
// beside the report, and the Chart button.
export function ReportTools({ page, wide }: { page: ReportPage; wide: boolean }) {
  const pick = (side: 'numbers' | 'text') => () => page.setSide(side)
  return (
    <>
      {page.chartOpen && wide && (
        <span className="sidesw" role="group" aria-label="Beside the chart">
          Beside the chart
          <span className="segc">
            <button className={page.side === 'numbers' ? 'on' : ''} aria-pressed={page.side === 'numbers'} onClick={pick('numbers')}>
              Numbers
            </button>
            <button className={page.side === 'text' ? 'on' : ''} aria-pressed={page.side === 'text'} onClick={pick('text')}>
              Text
            </button>
          </span>
        </span>
      )}
      <button className={page.chartOpen ? 'cbtn on' : 'cbtn'} aria-pressed={page.chartOpen} title="Open or close the chart (⌘3)" onClick={page.toggleChart}>
        {CHART_ICON}Chart<kbd>⌘3</kbd>
      </button>
    </>
  )
}

// The toolbar's subtitle. When the company has other reports, it is a small menu of them, newest
// first; picking one opens it.
export function ReportSubtitle({ text, others, onOpen }: { text: string; others: ReportSummary[]; onOpen: (reportId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const button = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (open) items.current[0]?.focus()
  }, [open])
  // A new report, or one with no others, closes the menu.
  useEffect(() => setOpen(false), [text, others.length])

  if (others.length === 0) return <>{text}</>

  const toggle = () => {
    const r = button.current?.getBoundingClientRect()
    if (r) setAt({ left: r.left - 8, top: r.bottom + 6 })
    setOpen((o) => !o)
  }
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const list = items.current.filter((b): b is HTMLButtonElement => b !== null)
    const i = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
      list[next]?.focus()
    } else if (e.key === 'Tab') close()
  }

  return (
    <>
      <button ref={button} className="subbtn" aria-haspopup="menu" aria-expanded={open} title="This company’s other reports" onClick={toggle}>
        {text}
        {CHEVRON}
      </button>
      {open && (
        <>
          <span className="rmenu-scrim" onMouseDown={() => setOpen(false)} />
          <span className="rmenu" role="menu" aria-label="Other reports" style={{ left: at.left, top: at.top }} onKeyDown={onKey}>
            <span className="rmenu-h">Other reports</span>
            {others.map((r, i) => {
              const choice = reportChoice(r)
              return (
                <button
                  key={r.report_id}
                  ref={(b) => {
                    items.current[i] = b
                  }}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    onOpen(r.report_id)
                  }}
                >
                  <span>{choice.label}</span>
                  <small>{choice.note}</small>
                </button>
              )
            })}
          </span>
        </>
      )}
    </>
  )
}
