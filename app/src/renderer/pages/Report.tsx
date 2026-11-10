// The report page (the spec's "Pages → 1. Report"). The report itself stays the engine's HTML in
// a sandboxed frame: its numbers column, its Summary / Full switch and its section links are the
// engine's (same-page links and CSS, no scripts). Around it, the app adds the toolbar's parts:
// the company's other reports under the subtitle, the Numbers / Text switch while the chart is
// open, and the Chart button (⌘3). The chart opens from the right as a split beside the report,
// with a divider between them (chart/split.ts): the report keeps the rest of the width, and in
// Full it is hidden until the divider is dragged back. A narrow window keeps the split, and a
// resize moves it at once, with no glide. The panel shows one view at a time (panel/state.ts):
// the price chart, or a chart or table a link in the report opened bigger, with the same switch,
// width buttons and close button. The state lives in report/useReport.ts.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'

import type { ViewId } from '../../main/navigation'
import type { ReportSummary } from '../../shared/protocol'
import { reportCss, withLook } from '../appearance/report'
import { useAppearance } from '../appearance/store'
import { ChartPane } from '../chart/ChartPane'
import { Divider } from '../chart/Divider'
import { DIV, fitsBeside, presetSplit, snapWidth, splitWidth, TEXT_MIN, type Preset, type Snap } from '../chart/split'
import { PanelSize, PanelSwitch } from '../panel/PanelHead'
import { viewTitle } from '../panel/titles'
import { useReportNumbers } from '../panel/useReportNumbers'
import type { PanelChrome } from '../panel/ViewFrame'
import { ViewPane } from '../panel/ViewPane'
import { useTextFrames } from '../report/frames'
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

// The width of an element, kept up to date as it changes. A change is drawn in the frame whose
// layout made it (flushSync), so the chart beside the report never lags a resized window by a
// frame, and the split keeps its share as the window moves.
function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    const watch = new ResizeObserver(() => flushSync(measure))
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return width
}

// Whether the report last went to one column, or back to two, because the page was resized
// (rather than the chart opening, closing or changing width). ReportTools reads it to show the
// Numbers / Text switch at once when a resize brings it.
let oneByResize = false

export function Report({ page, wide }: { page: ReportPage; wide: boolean }) {
  const { report, error, chartOpen, chartClosing, panel } = page
  const box = useRef<HTMLDivElement>(null)
  // Everything right of the sidebar: the report page's own width.
  const avail = useWidth(box)
  // The page's width changed in this render: the window or the sidebar was resized. The chart
  // moves with it at once, as a Mac window's parts do, with no glide (chart.css .resizing). A
  // width button, Half, an arrow key or a snap still glides the divider.
  const lastAvail = useRef(avail)
  const resizing = avail !== lastAvail.current
  useLayoutEffect(() => {
    lastAvail.current = avail
  })
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
  // The chart sits beside the report, with the divider, in a window of any width Tearsheet
  // allows: narrowing past 1,100 px (where the sidebar goes over the page) doesn't change it.
  // Only a page with no room for both (chart/split.ts) gives the chart all of it, alone.
  const fits = fitsBeside(avail)
  const split = chartOpen && at !== null && fits
  const full = split && at.mode === 'full'
  const alone = chartOpen && !fits
  const chartW = !chartOpen ? 0 : !fits ? avail : at ? splitWidth(at, avail) : 0
  // In Full the divider stays at the left, so the report can be dragged back.
  const paneW = full ? Math.max(0, avail - DIV) : chartW
  // The report's width. Hidden behind a Full chart, or one alone, it keeps the whole width
  // (chart.css), so it never squeezes to nothing and keeps its place.
  const reportW = split && !full ? Math.max(0, avail - chartW - DIV) : avail
  const one = oneColumn(reportW)
  useLayoutEffect(() => {
    if (page.oneColumn === one) return
    oneByResize = resizing
    page.setOneColumn(one)
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

  // The divider goes (the chart closing, or no room beside the report) mid-drag: drop the drag,
  // so the shield and the cursor never stick and a stale drag never decides the next opening.
  useEffect(() => {
    if (split) return
    dragNow.current = { on: false, snap: null }
    setDragging(false)
    setDrag(null)
  }, [split])

  const snapped = drag !== null && (drag.mode === 'half' || drag.mode === 'full')
  const cls = ['rpage', chartOpen && 'chartopen', chartClosing && 'closing', (full || alone) && !chartClosing && 'full', dragging && 'dragging', snapped && 'snapped', resizing && 'resizing']
    .filter(Boolean)
    .join(' ')
  const reportId = page.reportId
  const named = report ?? page.listed
  const text = report ? { key: page.textKey, html: report.html } : null
  const texts = useTextFrames(text, error !== null)
  // The look from Settings → Appearance goes into each frame's page (appearance/report.ts). A new
  // look loads the frames again; it only changes on the Appearance page, never with a report open.
  const { resolved } = useAppearance()
  const look = useMemo(() => reportCss(resolved), [resolved])

  // The panel's views. The price chart mounts the first time it shows in an opening and stays
  // mounted, hidden, while another view shows, so switching back keeps it as it was. A view's
  // pane mounts as it shows. Either one mounting while the panel was already open fades in where
  // the panel is, rather than sliding in.
  const away = panel.view !== 'price'
  const priceShown = useRef(false)
  if (!chartOpen) priceShown.current = false
  else if (!away) priceShown.current = true
  const openBefore = useRef(false)
  useEffect(() => {
    openBefore.current = chartOpen
  })
  const views = useReportNumbers(reportId, away, page.numbersVersion)
  const titleOf = (v: ViewId) => viewTitle(v, views.numbers?.tables ?? null)
  const size = split ? at.mode : null
  const chrome: PanelChrome = {
    switcher: <PanelSwitch view={panel.view} last={panel.last} title={titleOf} onShow={page.showView} />,
    size: <PanelSize split={split} size={size} onSize={onSize} onClose={page.toggleChart} />
  }

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
        {texts.frames.length > 0 && (
          <div className="rframe">
            {/* An empty sandbox: no scripts, forms, pop-ups or top-level navigation (Technical Plan §12).
                The text and numbers frames are the same report, with Text or Numbers as its one
                column beside the chart; the one not on show stays loaded, at the same size, so it
                keeps its place. While another text frame loads, the one on show stays under it
                (report/frames.ts). */}
            {texts.frames.map((f) => {
              const asked = f.key === text?.key
              const on = showing === 'text' ? ' on' : ''
              const phase = !asked || texts.shown === f.key ? '' : texts.ready === f.key ? ' fadein' : ' wait'
              return (
                <iframe
                  key={f.key}
                  className={`report-frame${on}${phase}`}
                  aria-hidden={showing !== 'text' || !asked}
                  title="Report"
                  sandbox=""
                  srcDoc={withLook(f.html, look)}
                  onLoad={asked ? () => texts.loaded(f.key) : undefined}
                />
              )
            })}
            {page.numbers && (
              <iframe
                key={`numbers:${page.textKey}`}
                className={showing === 'numbers' ? 'report-frame on' : 'report-frame'}
                aria-hidden={showing !== 'numbers'}
                title="Report, numbers"
                sandbox=""
                srcDoc={withLook(page.numbers.html, look)}
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
      {chartOpen && reportId && priceShown.current && (
        <ChartPane
          key={reportId}
          reportId={reportId}
          cik={named?.cik ?? null}
          ticker={named?.ticker ?? null}
          name={named?.name ?? null}
          width={paneW}
          split={split}
          size={size}
          onClose={page.toggleChart}
          onSize={onSize}
          switcher={chrome.switcher}
          away={away}
          swap={openBefore.current}
          rangeAsk={panel.rangeAsk}
          onHistory={page.historyDownloaded}
          keyNumbers={report?.key_numbers ?? null}
        />
      )}
      {chartOpen && reportId && away && (
        <ViewPane
          key={`${reportId}:${panel.view}`}
          view={panel.view}
          item={panel.item}
          numbers={views.numbers}
          problem={views.problem}
          retry={views.retry}
          ticker={named?.ticker ?? 'This company'}
          memory={page.memory}
          chrome={chrome}
          width={paneW}
          swap={openBefore.current}
        />
      )}
    </div>
  )
}

// The Numbers / Text switch: which column of the report sits beside the chart. `still` is read
// as it appears: it then shows without its settle-in.
function SideSwitch({ page, still }: { page: ReportPage; still: boolean }) {
  const [quiet] = useState(still)
  const pick = (side: 'numbers' | 'text') => () => page.setSide(side)
  return (
    <span className={quiet ? 'sidesw still' : 'sidesw'} role="group" aria-label="Beside the chart">
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
  )
}

const REFRESH_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </svg>
)

// The toolbar's right side on the report page: the Numbers / Text switch while the chart is open
// beside the report, Refresh (a new report on this company, after a confirm: shell/refresh.ts)
// and the Chart button.
export function ReportTools({ page, wide, onRefresh }: { page: ReportPage; wide: boolean; onRefresh?: () => void }) {
  // The switch settles in when the chart brings it (opening, or leaving Full). A resize that
  // brings it (the window widened past 1,100 px, or the report narrowed to one column) shows it
  // at once, as the rest of the window moves at once.
  const seen = useRef({ wide, one: page.oneColumn })
  useLayoutEffect(() => {
    seen.current = { wide, one: page.oneColumn }
  })
  const byResize = wide !== seen.current.wide || (page.oneColumn !== seen.current.one && oneByResize)
  return (
    <>
      {page.chartOpen && wide && page.split?.mode !== 'full' && page.oneColumn && <SideSwitch page={page} still={byResize} />}
      {onRefresh && (
        <button className="cbtn" aria-label="Refresh" title="Write a new report on this company. You’re asked first." onClick={onRefresh}>
          {REFRESH_ICON}
          {wide && 'Refresh'}
        </button>
      )}
      <button className={page.chartOpen ? 'cbtn on' : 'cbtn'} aria-pressed={page.chartOpen} title="Open or close the chart (⌘3)" onClick={page.toggleChart}>
        {CHART_ICON}Chart{wide && <kbd>⌘3</kbd>}
      </button>
    </>
  )
}

// The toolbar's subtitle. When the company has other reports, it is a small menu of them, newest
// first; picking one opens it. Its last item deletes the report on show (`onDelete`). Beside the report's top bar it shows `label` (the report's date)
// instead of `text`, and `text` becomes what pointing at it says.
export function ReportSubtitle({
  text,
  others,
  onOpen,
  label,
  className,
  onDelete
}: {
  text: string
  others: ReportSummary[]
  onOpen: (reportId: string) => void
  label?: ReactNode
  className?: string
  onDelete?: () => void
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
            {onDelete && (
              <>
                <span className="rmenu-sep" role="separator" />
                <button
                  ref={(b) => {
                    items.current[others.length] = b
                  }}
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setOpen(false)
                    onDelete()
                  }}
                >
                  <span>Delete this report</span>
                </button>
              </>
            )}
          </span>
        </>
      )}
    </>
  )
}
