// The report page (the spec's "Pages → 1. Report"). The report itself stays the engine's HTML in
// a sandboxed frame: its numbers column, its Summary / Full switch and its section links are the
// engine's (same-page links and CSS, no scripts). Around it, the app adds the toolbar's parts:
// the company's other reports under the subtitle, the Numbers / Text switch while the chart is
// open, and the Chart button (⌘3). The chart opens from the right as a split beside the report,
// with a divider between them (chart/split.ts): the report keeps the rest of the width, and in
// Full it is hidden until the divider is dragged back. A narrow window gives the chart the whole
// window. The state lives in report/useReport.ts.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

import type { ReportSummary } from '../../shared/protocol'
import { ChartPane } from '../chart/ChartPane'
import { Divider } from '../chart/Divider'
import { DIV, presetSplit, snapWidth, splitWidth, TEXT_MIN, type Preset, type Snap } from '../chart/split'
import type { ReportPage } from '../report/useReport'
import { oneColumn, reportChoice, shownSide } from '../report/view'

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

// The width of an element, kept up to date as it changes.
function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return width
}

export function Report({ page, wide }: { page: ReportPage; wide: boolean }) {
  const { report, error, chartOpen, chartClosing } = page
  const box = useRef<HTMLDivElement>(null)
  // Everything right of the sidebar: the report page's own width.
  const avail = useWidth(box)
  // A drag of the divider, live: where it would snap, before it is let go.
  const [drag, setDrag] = useState<Snap | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragNow = useRef<{ on: boolean; snap: Snap | null }>({ on: false, snap: null })

  // The chart opens at Half, in the space there is.
  const placed = page.split ?? (chartOpen && avail > 0 ? presetSplit('half', avail) : null)
  useLayoutEffect(() => {
    if (chartOpen && !page.split && placed) page.setSplit(placed)
  })

  const at = drag ?? placed
  const split = wide && chartOpen && at !== null
  const full = split && at.mode === 'full'
  const chartW = !chartOpen ? 0 : !wide ? avail : at ? splitWidth(at, avail) : 0
  // In Full the divider stays at the left, so the report can be dragged back.
  const paneW = full ? Math.max(0, avail - DIV) : chartW
  // The report's width. Hidden behind a Full chart, or a narrow window's, it keeps the whole
  // width (report.css), so it never squeezes to nothing and keeps its place.
  const reportW = split && !full ? Math.max(0, avail - chartW - DIV) : avail
  const one = oneColumn(reportW)
  useLayoutEffect(() => {
    if (page.oneColumn !== one) page.setOneColumn(one)
  })
  const showing = shownSide(page.side, one, page.numbers !== null && page.numbersReady, chartOpen && wide)

  const onStart = () => {
    dragNow.current = { on: true, snap: null }
    setDragging(true)
  }
  const onDrag = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || !dragNow.current.on) return
    const next = snapWidth(r.right - clientX - DIV / 2, r.width)
    dragNow.current.snap = next
    setDrag(next)
  }
  const onDrop = () => {
    const { on, snap } = dragNow.current
    if (!on) return
    dragNow.current = { on: false, snap: null }
    setDragging(false)
    setDrag(null)
    if (snap) page.setSplit({ mode: snap.mode, width: snap.width })
  }
  const onHalf = () => page.setSplit(presetSplit('half', avail))
  const onStep = (delta: number) => {
    const next = full && delta < 0 ? snapWidth(avail - TEXT_MIN - DIV, avail) : snapWidth(chartW + delta, avail)
    page.setSplit({ mode: next.mode, width: next.width })
  }
  const onSize = (p: Preset) => page.setSplit(presetSplit(p, avail))

  // The divider goes (the chart closing, or a narrow window) mid-drag: drop the drag, so the
  // shield and the cursor never stick and a stale drag never decides the next opening.
  useEffect(() => {
    if (split) return
    dragNow.current = { on: false, snap: null }
    setDragging(false)
    setDrag(null)
  }, [split])

  const snapped = drag !== null && (drag.mode === 'half' || drag.mode === 'full')
  const cls = ['rpage', chartOpen && 'chartopen', chartClosing && 'closing', full && !chartClosing && 'full', dragging && 'dragging', snapped && 'snapped'].filter(Boolean).join(' ')
  const reportId = page.reportId
  const named = report ?? page.listed

  return (
    <div ref={box} className={cls}>
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
          <div className="rframe">
            {/* An empty sandbox: no scripts, forms, pop-ups or top-level navigation (Technical Plan §12).
                The two frames are the same report, with Text or Numbers as its one column beside
                the chart; the one not on show stays loaded, at the same size, so it keeps its place. */}
            <iframe key={page.textKey} className={showing === 'text' ? 'report-frame on' : 'report-frame'} aria-hidden={showing !== 'text'} title="Report" sandbox="" srcDoc={report.html} />
            {page.numbers && (
              <iframe
                key={`numbers:${page.textKey}`}
                className={showing === 'numbers' ? 'report-frame on' : 'report-frame'}
                aria-hidden={showing !== 'numbers'}
                title="Report, numbers"
                sandbox=""
                srcDoc={page.numbers.html}
                onLoad={() => page.setNumbersReady(true)}
              />
            )}
          </div>
        )}
      </div>
      {split && (
        <Divider
          label={drag?.label ?? null}
          dragging={dragging}
          width={chartW}
          max={avail}
          onStart={onStart}
          onDrag={onDrag}
          onDrop={onDrop}
          onHalf={onHalf}
          onStep={onStep}
        />
      )}
      {dragging && <div className="dragshield" />}
      {chartOpen && reportId && (
        <ChartPane
          key={reportId}
          reportId={reportId}
          cik={named?.cik ?? null}
          ticker={named?.ticker ?? null}
          name={named?.name ?? null}
          width={paneW}
          wide={wide}
          size={split ? at.mode : null}
          onClose={page.toggleChart}
          onSize={onSize}
        />
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
      {page.chartOpen && wide && page.split?.mode !== 'full' && page.oneColumn && (
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
        {CHART_ICON}Chart{wide && <kbd>⌘3</kbd>}
      </button>
    </>
  )
}

// The toolbar's subtitle. When the company has other reports, it is a small menu of them, newest
// first; picking one opens it. Beside the report's top bar it shows `label` (the report's date)
// instead of `text`, and `text` becomes what pointing at it says.
export function ReportSubtitle({
  text,
  others,
  onOpen,
  label,
  className
}: {
  text: string
  others: ReportSummary[]
  onOpen: (reportId: string) => void
  label?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const button = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (open) items.current[0]?.focus()
  }, [open])
  // A new report, or one with no others, closes the menu.
  useEffect(() => setOpen(false), [text, others.length])

  if (others.length === 0)
    return label ? (
      <span className={className} title={text}>
        {label}
      </span>
    ) : (
      <>{text}</>
    )

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
      <button
        ref={button}
        className={className ?? 'subbtn'}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label ? `${text}. Pick another of this company’s reports.` : 'This company’s other reports'}
        onClick={toggle}
      >
        {label ?? text}
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
