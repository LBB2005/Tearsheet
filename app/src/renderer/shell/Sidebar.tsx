// The Claude-style sidebar (the spec's "The window"): flat dark, with no boxes or borders. From
// top to bottom: New report and Look up, the "Reports" label and one row per company, then
// Prediction log, Settings and the status line.

import type { ReactElement } from 'react'

import type { CompanyRow } from '../../shared/protocol'
import type { Page, StatusLine } from '../nav'

// Line icons from the prototype (report-look-c-chart-split.html, ICON4).
export const ICONS: Record<'side' | 'plus' | 'search' | 'log' | 'gear', ReactElement> = {
  side: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  ),
  log: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19h16M7 16V9M12 16V5M17 16v-4" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  )
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// The button beside the window buttons (left 88 px, top 13 px). It stays when the sidebar is
// hidden, so the sidebar can come back.
export function SidebarButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button className="sbt" aria-label={shown ? 'Hide the sidebar' : 'Show the sidebar'} aria-expanded={shown} title="Show or hide the sidebar (⌃⌘S)" onClick={onClick}>
      {ICONS.side}
    </button>
  )
}

export interface SidebarProps {
  page: Page
  companies: CompanyRow[]
  openReport: string | null
  status: StatusLine
  onNew: () => void
  onLookUp: () => void
  onCompany: (row: CompanyRow) => void
  onPage: (page: 'log' | 'settings') => void
}

export function Sidebar({ page, companies, openReport, status, onNew, onLookUp, onCompany, onPage }: SidebarProps) {
  const row = (on: boolean) => (on ? 'row4 on' : 'row4')
  return (
    <aside className="side4" aria-label="Sidebar">
      {/* The strip beside the window buttons drags the window, as the toolbar does. */}
      <div className="sidedrag" />
      <div className="in">
        <button className={row(page === 'home')} aria-current={page === 'home' ? 'page' : undefined} onClick={onNew}>
          {ICONS.plus}New report<kbd>⌘N</kbd>
        </button>
        <button className="row4" onClick={onLookUp}>
          {ICONS.search}Look up<kbd>⌘K</kbd>
        </button>
        <div className="lbl4" id="side-reports">
          Reports
        </div>
        <div className="list4" role="list" aria-labelledby="side-reports">
          {companies.length === 0 && <div className="empty4">Your reports will show here.</div>}
          {companies.map((c) => {
            const on = page === 'report' && c.report_id === openReport
            return (
              <div role="listitem" key={c.cik}>
                <button className={row(on)} aria-current={on ? 'page' : undefined} title={c.name} onClick={() => onCompany(c)}>
                  <b>{c.ticker}</b>
                  {c.price !== null && <span className="px">{money.format(c.price)}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <button className={row(page === 'log')} aria-current={page === 'log' ? 'page' : undefined} onClick={() => onPage('log')}>
          {ICONS.log}Prediction log
        </button>
        <button className={row(page === 'settings')} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onPage('settings')}>
          {ICONS.gear}Settings<kbd>⌘,</kbd>
        </button>
        <div className={status.tone === 'ok' ? 'status4' : `status4 ${status.tone}`} role="status">
          <i />
          <span>{status.text}</span>
          {status.progress !== undefined && (
            <div className="pb">
              <i style={{ width: `${Math.round(status.progress * 1000) / 10}%` }} />
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
