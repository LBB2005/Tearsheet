// The panel while it shows a view other than the price chart: a chart, table or ring opened
// bigger from the report (the spec's "Click to open bigger"). It is a pane of the same shape as the
// price chart's, at the same width, and each view draws inside it with ViewFrame. pages/Report.tsx
// mounts one per view, keyed by the report and the view, and the view's state is kept in the
// report's ViewMemory, so it comes back as it was left.

import { useState, type CSSProperties, type ReactElement } from 'react'

import type { ViewId, ViewKind } from '../../main/navigation'
import type { ReportNumbers } from '../../shared/protocol'
import type { ViewMemory } from './memory'
import { viewTitle } from './titles'
import { ANALYSTS_START } from '../views/analysts'
import { Analysts } from '../views/AnalystsPane'
import { FACTORS_START } from '../views/factors'
import { Factors } from '../views/FactorsPane'
import { Economy, RedFlags, Rings } from '../views/FiguresPane'
import { METRICS_START } from '../views/metrics'
import { Metrics } from '../views/MetricsPane'
import { METHODS_START } from '../views/methods'
import { Methods } from '../views/MethodsPane'
import { RETURNS_START } from '../views/returns'
import { Returns } from '../views/ReturnsPane'
import { TABLE_START } from '../views/table'
import { Table } from '../views/TablePane'
import { ViewFrame, type PanelChrome, type ViewProps } from './ViewFrame'

export interface ViewSpec {
  // The view's state the first time it opens for a report.
  start: unknown
  // Each view's own state type, which only its pane and its start know.
  Pane: (p: ViewProps<any>) => ReactElement
}

// Each view's pane. Every `table-<key>` view shares the one table pane.
export const VIEW_PANES: Partial<Record<ViewKind | 'table', ViewSpec>> = {
  factors: { start: FACTORS_START, Pane: Factors },
  metrics: { start: METRICS_START, Pane: Metrics },
  methods: { start: METHODS_START, Pane: Methods },
  returns: { start: RETURNS_START, Pane: Returns },
  flags: { start: null, Pane: RedFlags },
  economy: { start: null, Pane: Economy },
  rings: { start: null, Pane: Rings },
  analysts: { start: ANALYSTS_START, Pane: Analysts },
  table: { start: TABLE_START, Pane: Table }
}

const kindOf = (view: ViewId): ViewKind | 'table' => (view.startsWith('table-') ? 'table' : (view as ViewKind))

export interface ViewPaneProps {
  view: ViewId
  item: string | null
  numbers: ReportNumbers | null
  problem: string | null
  retry: () => void
  ticker: string
  memory: ViewMemory
  chrome: PanelChrome
  width: number
  // The panel was already open as this pane mounted: another view, or the price chart, was on
  // show, so it fades in where the pane already is rather than sliding in from the edge.
  swap: boolean
}

export function ViewPane({ view, item, numbers, problem, retry, ticker, memory, chrome, width, swap }: ViewPaneProps) {
  const spec = VIEW_PANES[kindOf(view)]
  // As it was when the pane mounted: a class that came or went later would start, or cut short,
  // the pane's own animation.
  const [swapped] = useState(swap)
  const [state, setLocal] = useState<unknown>(() => memory.get(view, spec?.start))
  const setState = (next: unknown) => {
    memory.set(view, next)
    setLocal(next)
  }
  const title = viewTitle(view, numbers?.tables ?? null)

  let inside: ReactElement
  if (problem)
    inside = (
      <ViewFrame chrome={chrome} title={title} subtitle={ticker}>
        <div className="cmsg" role="alert">
          <p>This view didn’t load. {problem}</p>
          <button className="plain" onClick={retry}>
            Try again
          </button>
        </div>
      </ViewFrame>
    )
  else if (!numbers || !spec)
    inside = (
      <ViewFrame chrome={chrome} title={title} subtitle={ticker}>
        <div className="skel" aria-label="Loading this view" />
      </ViewFrame>
    )
  else inside = <spec.Pane chrome={chrome} view={view} numbers={numbers} ticker={ticker} item={item} state={state} setState={setState} />

  const cls = ['cpane', 'vpane', swapped && 'swap', width < 760 && 'narrowp'].filter(Boolean).join(' ')
  // The content keeps the pane's width while the pane slides in or out (panel.css).
  const style = { width, '--pane-w': `${width}px` } as CSSProperties
  return (
    <section className={cls} style={style} aria-label={title}>
      {inside}
    </section>
  )
}
