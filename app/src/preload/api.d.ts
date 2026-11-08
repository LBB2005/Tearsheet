// The window's view of the bridge in preload/index.ts.

export interface CallResult<T = unknown> {
  ok: boolean
  result?: T
  error?: { message: string; code?: string; data?: Record<string, unknown> }
}

export interface ToolStatus {
  kind: 'claude' | 'codex'
  name: string
  path: string | null
  available: boolean
  version: string | null
  loggedIn: boolean | null
  reason: string | null
}

export interface EngineNotification {
  method: string
  params: Record<string, unknown>
}

export interface TearsheetApi {
  // Both answer with the run's id and the company it resolved (step 1).
  runReport(query: string, tool?: string): Promise<CallResult<import('../shared/protocol').RunStarted>>
  cancel(runId: string): Promise<CallResult<{ ok: boolean }>>
  resume(runId: string): Promise<CallResult<import('../shared/protocol').RunStarted>>
  // `narrow`: a window under 1,100 px, with the text alone; the engine adds the key-number tiles.
  getReport(reportId: string, opts?: { view?: 'summary' | 'full'; column?: 'both' | 'numbers' | 'text' | 'auto'; narrow?: boolean; side?: 'text' | 'numbers'; motion?: boolean }): Promise<CallResult<import('../shared/protocol').ReportResult>>
  listCompanies(): Promise<CallResult<import('../shared/protocol').CompanyRow[]>>
  searchCompanies(query: string, limit?: number): Promise<CallResult<import('../shared/protocol').SearchHit[]>>
  getChart(reportId: string): Promise<CallResult<import('../shared/protocol').ChartSeries>>
  // The report's numbers for the panel's bigger views, each item with its readout.
  getReportNumbers(reportId: string): Promise<CallResult<import('../shared/protocol').ReportNumbers>>
  // analystdb's view of the report's company, as of its price date, for the Analyst ratings view.
  getAnalysts(reportId: string): Promise<CallResult<import('../shared/protocol').ReportAnalysts>>
  fetchHistory(reportId: string): Promise<CallResult<import('../shared/protocol').FetchHistoryResult>>
  checkKey(service: 'massive' | 'fred', key: string): Promise<CallResult<import('../shared/protocol').KeyChecked>>
  runSafetyCheck(tool: 'claude' | 'codex'): Promise<CallResult<import('../shared/protocol').SafetyStarted>>
  openTerminal(): Promise<void>
  openExternal(url: string): Promise<boolean>
  find(text: string, forward: boolean): Promise<void>
  stopFind(): Promise<void>
  onMenu(fn: (c: import('../main/menu').MenuCommand) => void): () => void
  // Newest first; `limit` defaults to the engine's 50. `hidden`: only the reports hidden from
  // the sidebar, for its Hidden group; otherwise those are left out.
  listReports(limit?: number, hidden?: boolean): Promise<CallResult<import('../shared/protocol').ReportSummary[]>>
  // Deleting from the sidebar (engine report_marks.py): hide at once, bring back on Undo, and
  // erase once the undo has passed. Official and reviewed reports are only ever hidden.
  hideReports(reportIds: string[]): Promise<CallResult<import('../shared/protocol').HideResult>>
  showReports(reportIds: string[]): Promise<CallResult<import('../shared/protocol').ShowResult>>
  eraseReports(reportIds: string[]): Promise<CallResult<import('../shared/protocol').EraseResult>>
  pinCompany(cik: number, pinned: boolean): Promise<CallResult<{ ok: boolean }>>
  listPredictions(): Promise<CallResult<import('../shared/protocol').PredictionSummary[]>>
  flagClaim(claimId: string, note: string): Promise<CallResult<{ review_id: string }>>
  rereadFiling(accession: string): Promise<CallResult<{ deleted: number }>>
  getTools(force?: boolean): Promise<ToolStatus[]>
  setKey(service: string, key: string): Promise<CallResult<{ ok: boolean }>>
  getSettings(): Promise<CallResult<import('../shared/protocol').SettingsResult>>
  setSetting(key: string, value: string): Promise<CallResult<{ ok: boolean }>>
  gradeDue(): Promise<CallResult<import('../shared/protocol').GradeResult>>
  onNotification(fn: (note: EngineNotification) => void): () => void
  onFlagRequested(fn: (payload: { claimId: string }) => void): () => void
  onOpenView(fn: (payload: { view: import('../main/navigation').ViewId; item: string | null }) => void): () => void
}

declare global {
  interface Window {
    tearsheet: TearsheetApi
  }
}
