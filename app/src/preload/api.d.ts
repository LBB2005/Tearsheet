// The window's view of the bridge in preload/index.ts.

import type { RunResult } from '../shared/install'
import type { TerminalResult, ToolCommands, ToolKind, ToolStatus } from '../shared/tools'

// The one ToolStatus, written in shared/tools.ts (first-run design item 1).
export type { TerminalResult, ToolCommands, ToolKind, ToolStatus } from '../shared/tools'
// The Install button's message and answer, written in shared/install.ts (first-run design item 29).
export type { InstallProgress, InstallStatus, RunResult } from '../shared/install'

export interface CallResult<T = unknown> {
  ok: boolean
  result?: T
  error?: { message: string; code?: string; data?: Record<string, unknown> }
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
  // Stops the safety check after the call in progress (the engine's cancel_safety_check).
  cancelSafetyCheck(): Promise<CallResult<import('../shared/protocol').CancelSafetyCheckResult>>
  // Whether the screen waits on the person (setup, or Home waiting on a tool): while it does and
  // the window is in front, the main process reads the tools every 5 seconds, and a change
  // arrives as a tools_changed notification ({ tools: ToolStatus[] }).
  windowState(state: { waiting: boolean }): Promise<void>
  // Copies the paste command for these tools, built by the main process from their status, and
  // opens a new Terminal window; says which part failed.
  copyAndOpenTerminal(kinds: ToolKind[]): Promise<TerminalResult>
  // The exact commands for these tools, for the connect card to show. Only reads.
  commandsFor(kinds: ToolKind[]): Promise<ToolCommands>
  // Show log in Finder: logs/setup.log in the data folder. False when there is no log yet.
  showSetupLog(): Promise<boolean>
  // The Install button (first-run design item 29). install runs the steps for these tools one at
  // a time and answers once they have finished; each step's progress arrives first as an
  // install_progress notification (params: InstallProgress). `refused` means nothing ran (the
  // online off switch said off this launch, a run is already under way, or the kinds weren't
  // known), and the window shows the paste command instead.
  install(kinds: ToolKind[]): Promise<RunResult>
  // Stops the sign-in under way; answers once it has stopped, cancelled has been sent and the
  // tools read again. False when no sign-in was running (an install is never stopped).
  cancelInstall(): Promise<boolean>
  // "Browser didn't open? Open the sign-in page": opens the page the running sign-in printed.
  // The window never sees the link. False when there is none (or the browser didn't open).
  openSignInPage(): Promise<boolean>
  // Whether the Install button shows: INSTALL_BUTTON, and the online off switch saved before this
  // launch isn't off. Always answers, even with the build's switch off.
  getInstallButton(): Promise<boolean>
  openExternal(url: string): Promise<boolean>
  // The version numbers for Settings → About and help (main/about.ts).
  about(): Promise<import('../main/about').AboutInfo>
  // Opens the person's own Mail with a feedback email holding those numbers; nothing is sent.
  sendFeedback(): Promise<boolean>
  find(text: string, forward: boolean): Promise<void>
  stopFind(): Promise<void>
  // The look picked on Settings → Appearance, for the window itself: its zoom (text size, 0.85 to
  // 1.3) and its own colour (shown before the page draws and while it resizes). main/look.ts.
  setLook(look: { zoom: number; background: string }): Promise<boolean>
  // Theme files, through the Mac's own open and save panels. Open answers with the file's text,
  // which the window then reads as untrusted (appearance/themeFile.ts).
  openTheme(): Promise<import('../main/look').OpenedTheme>
  saveTheme(name: string, text: string): Promise<import('../main/look').SavedTheme>
  onMenu(fn: (c: import('../main/menu').MenuCommand) => void): () => void
  // A download from the end of the report: saving, then saved (with its path) or failed (with
  // why). Show in Finder works only for a file saved this session.
  onDownload(fn: (note: import('../main/downloads').DownloadNote) => void): () => void
  showDownload(path: string): Promise<boolean>
  // Newest first; `limit` defaults to the engine's 50. `hidden`: only the reports hidden from
  // the sidebar, for its Hidden group; otherwise those are left out.
  listReports(limit?: number, hidden?: boolean): Promise<CallResult<import('../shared/protocol').ReportSummary[]>>
  // Deleting from the sidebar (engine report_marks.py): hide at once, bring back on Undo, and
  // erase once the undo has passed. Official and reviewed reports are only ever hidden.
  hideReports(reportIds: string[]): Promise<CallResult<import('../shared/protocol').HideResult>>
  showReports(reportIds: string[]): Promise<CallResult<import('../shared/protocol').ShowResult>>
  eraseReports(reportIds: string[]): Promise<CallResult<import('../shared/protocol').EraseResult>>
  pinCompany(cik: number, pinned: boolean): Promise<CallResult<{ ok: boolean }>>
  // The line: several reports written one after another. planLine changes nothing; it says which
  // companies were found and which would make a new official prediction. A quick add (`group`:
  // the whole S&P 500, a `sector`, or the rest without a finished report) comes before the
  // queries; `skipRecent` leaves out companies with a report from the last 30 days.
  planLine(
    queries: string[],
    opts?: { group?: 'all' | 'sector' | 'rest'; sector?: string; skipRecent?: boolean }
  ): Promise<CallResult<import('../shared/protocol').LinePlan>>
  addToLine(queries: string[]): Promise<CallResult<import('../shared/protocol').LinePlan>>
  getLine(): Promise<CallResult<import('../shared/protocol').LineState>>
  removeFromLine(ticker: string): Promise<CallResult<import('../shared/protocol').LineState>>
  // Cancel all: stops the report being written and empties the line.
  clearLine(): Promise<CallResult<import('../shared/protocol').LineState>>
  // Goes on with the companies waiting, past a stopped report or after Tearsheet opened again.
  carryOnLine(): Promise<CallResult<import('../shared/protocol').LineState>>
  // The quick adds, with how many companies each holds.
  lineGroups(): Promise<CallResult<import('../shared/protocol').LineGroups>>
  listPredictions(): Promise<CallResult<import('../shared/protocol').PredictionSummary[]>>
  // The prediction log's compare chart: total-return lines on SPY's days from `since` (read only).
  predictionPrices(ciks: number[], since: string): Promise<CallResult<import('../shared/protocol').PredictionPrices>>
  // Saves the log's CSV to ~/Downloads under a free name; then showDownload(path) works on it.
  saveCsv(name: string, text: string): Promise<{ ok: true; name: string; path: string } | { ok: false; message: string }>
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
