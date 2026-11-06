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
  runReport(query: string, tool?: string): Promise<CallResult<{ run_id: string }>>
  cancel(runId: string): Promise<CallResult<{ ok: boolean }>>
  resume(runId: string): Promise<CallResult<{ run_id: string }>>
  getReport(reportId: string, opts?: { view?: 'summary' | 'full'; column?: 'both' | 'numbers' | 'text' }): Promise<CallResult<import('../shared/protocol').ReportResult>>
  listCompanies(): Promise<CallResult<import('../shared/protocol').CompanyRow[]>>
  searchCompanies(query: string, limit?: number): Promise<CallResult<import('../shared/protocol').SearchHit[]>>
  getChart(reportId: string): Promise<CallResult<import('../shared/protocol').ChartSeries>>
  fetchHistory(reportId: string): Promise<CallResult<import('../shared/protocol').FetchHistoryResult>>
  checkKey(service: 'massive' | 'fred', key: string): Promise<CallResult<import('../shared/protocol').KeyChecked>>
  runSafetyCheck(tool: 'claude' | 'codex'): Promise<CallResult<import('../shared/protocol').SafetyStarted>>
  openTerminal(): Promise<void>
  openExternal(url: string): Promise<boolean>
  find(text: string, forward: boolean): Promise<void>
  stopFind(): Promise<void>
  onMenu(fn: (c: import('../main/menu').MenuCommand) => void): () => void
  listReports(): Promise<CallResult<import('../shared/protocol').ReportSummary[]>>
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
}

declare global {
  interface Window {
    tearsheet: TearsheetApi
  }
}
