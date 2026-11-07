// The layout every bigger view shares, in the price chart's own classes (chart/chart.css), so a
// view looks and behaves like the chart beside it: the switch, then the head with the name, the
// readout line and the controls (the view's own, then the width and close buttons), then the body.

import type { ReactElement, ReactNode } from 'react'

import type { ReportNumbers } from '../../shared/protocol'

import './panel.css'

// The panel's shared parts, built once by pages/Report.tsx (PanelHead.tsx).
export interface PanelChrome {
  switcher: ReactNode
  size: ReactNode
}

// What a view's pane is given. Its state lives in the report's ViewMemory, so it comes back as it
// was left when the view opens again while the report is open.
export interface ViewProps<S> {
  chrome: PanelChrome
  numbers: ReportNumbers
  ticker: string
  item: string | null
  state: S
  setState: (s: S) => void
}

export function ViewFrame({
  chrome,
  title,
  subtitle,
  readout,
  controls,
  children
}: {
  chrome: PanelChrome
  title: string
  subtitle?: string | null
  // What the item pointed at or focused says; the view's own summary otherwise.
  readout?: ReactNode
  // A view with no switches of its own has none.
  controls?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <div className="cpin">
      {chrome.switcher}
      <div className="cph">
        <div className="cpt">
          <b>{title}</b>
          {subtitle && <span title={subtitle}>{subtitle}</span>}
        </div>
        <div className="vread">{readout}</div>
        <div className="cpctl">
          {controls}
          {chrome.size}
        </div>
      </div>
      <div className="vbody">{children}</div>
    </div>
  )
}
