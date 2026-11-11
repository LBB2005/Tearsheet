// The window ↔ main bridge (design item 45; first-run design item 11): a fixed set of named calls,
// and nothing else. The window can say which tools to set up, never what to run: every command is
// built here, from toolSteps.

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

import { BrowserWindow, clipboard, ipcMain, shell } from 'electron'

import type { RunResult } from '../shared/install'
import type { TerminalResult, ToolCommands, ToolKind } from '../shared/tools'
import { feedbackMailto, type AboutInfo } from './about'
import { diagnosticsText, readLogTail } from './diagnostics'
import type { Engine } from './engine'
import { EngineError } from './engine'
import { isAllowedExternal } from './external'
import type { Installer } from './installer'
import { commandFor, toolCommands } from './pasteCommand'
import { NO_LOG, type SetupLog } from './setupLog'
import { copyAndOpen } from './terminal'
import type { StepRules } from './toolSteps'
import type { ToolWatch } from './toolWatch'

// Window call name → engine method.
export const CALLS: Record<string, string> = {
  runReport: 'run_report',
  cancel: 'cancel',
  resume: 'resume',
  getReport: 'get_report',
  listReports: 'list_reports',
  listPredictions: 'list_predictions',
  flagClaim: 'flag_claim',
  rereadFiling: 'reread_filing',
  setKey: 'set_key',
  getSettings: 'get_settings',
  setSetting: 'set_setting',
  gradeDue: 'grade_due',
  listCompanies: 'list_companies',
  searchCompanies: 'search_companies',
  getChart: 'get_chart',
  predictionPrices: 'prediction_prices',
  getReportNumbers: 'get_report_numbers',
  getAnalysts: 'get_analysts',
  fetchHistory: 'fetch_history',
  checkKey: 'check_key',
  runSafetyCheck: 'run_safety_check',
  cancelSafetyCheck: 'cancel_safety_check',
  hideReports: 'hide_reports',
  showReports: 'show_reports',
  eraseReports: 'erase_reports',
  pinCompany: 'pin_company',
  // The line: several reports, one after another.
  planLine: 'plan_line',
  addToLine: 'add_to_line',
  getLine: 'get_line',
  removeFromLine: 'remove_from_line',
  clearLine: 'clear_line',
  carryOnLine: 'carry_on_line',
  lineGroups: 'line_groups'
}

// The closed allowlist: only the names above, never inherited object properties.
export function engineMethod(name: unknown): string | null {
  return typeof name === 'string' && Object.hasOwn(CALLS, name) ? CALLS[name] : null
}

// Find in the page (⌘F). Electron begins a new find session only when `findNext` is true; a
// request without it is a follow-up that moves to the next or previous match. So a new or changed
// query starts a session, and the same query again steps through its matches.
export function findRequest(last: string | null, text: unknown, forward: unknown): { text: string; forward: boolean; findNext: boolean } | null {
  if (typeof text !== 'string' || !text) return null
  const query = text.slice(0, 200)
  return { text: query, forward: forward !== false, findNext: query !== last }
}

// Whether the window is still there to talk to. Once it has closed, Electron throws on any use of
// it, even reading its webContents, and a throw in the main process opens Electron's error box,
// which holds everything up. Quitting while a report runs closes the window while the engine is
// still stopping, and the report's last progress notes arrive after it.
function isOpen(window: BrowserWindow): boolean {
  return !window.isDestroyed() && !window.webContents.isDestroyed()
}

// Sends one notification to the window, if it is still there. index.ts sends install_progress
// through it too.
export function notify(window: BrowserWindow, note: unknown): void {
  if (isOpen(window)) window.webContents.send('tearsheet:notification', note)
}

// The tools a window call names: one or both of the known kinds, and nothing else. Anything else
// (a string, command text, an unknown name) is refused.
export function parseKinds(value: unknown): ToolKind[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) return null
  if (!value.every((k) => k === 'claude' || k === 'codex')) return null
  return [...new Set(value as ToolKind[])]
}

export interface CallResult {
  ok: boolean
  result?: unknown
  error?: { message: string; code?: string; data?: Record<string, unknown> }
}

export interface IpcDeps {
  // The one owner of the tools' status reads (toolWatch.ts).
  watch: ToolWatch
  // This launch's test rules, for the steps and the paste command (toolSteps.ts).
  rules: StepRules
  log?: SetupLog
  // <data folder>/logs/setup.log, for Show log in Finder.
  setupLogFile?: string
  // The version numbers for Settings → About and help and the feedback email (main/about.ts);
  // index.ts reads them from Electron and the engine's hello.
  about?: () => AboutInfo
  // Copies the paste command and opens Terminal (terminal.ts), faked in tests.
  copyAndOpen?: (command: string) => Promise<TerminalResult>
  // The Install button (installer.ts). index.ts gives it only when INSTALL_BUTTON is on, and its
  // three calls are registered only then.
  installer?: Pick<Installer, 'run' | 'cancel' | 'openSignInPage'>
  // "The button is on" (installSwitch.getInstallButton): INSTALL_BUTTON, and the online off
  // switch saved before this launch isn't off. False when not given.
  installButton?: () => boolean
  // <data folder>/logs/engine.log, whose last lines Copy diagnostics copies (diagnostics.ts).
  engineLogFile?: string
  // The home folder Copy diagnostics takes out of the text; os.homedir() when not given.
  home?: string
  // Puts Copy diagnostics' text on the clipboard; Electron's clipboard when not given.
  writeClipboard?: (text: string) => void
}

// How long Copy diagnostics waits for the engine to say which AI tool reports use.
const DIAGNOSTICS_WAIT_MS = 2000

const NO_COMMANDS: ToolCommands = { steps: [], blocked: [], paste: null }

export function registerIpc(window: BrowserWindow, engine: Engine, deps: IpcDeps): void {
  const log = deps.log ?? NO_LOG
  const about = deps.about ?? (() => ({ app: '', engine: null, macos: '', electron: '' }))
  const copy = deps.copyAndOpen ?? ((command: string) => copyAndOpen(command, { clipboard, log }))
  ipcMain.handle('tearsheet:call', async (_event, name: string, params: Record<string, unknown>): Promise<CallResult> => {
    const method = engineMethod(name)
    if (!method) return { ok: false, error: { message: `Unknown call ${name}.` } }
    try {
      const result = await engine.request(method, params ?? {})
      if (method === 'run_report' || method === 'resume') engine.lastRunId = (result as { run_id: string }).run_id
      if (method === 'check_key') log.log('key_check', { code: 'ok' })
      return { ok: true, result }
    } catch (error) {
      if (error instanceof EngineError) {
        // A key check's answer is logged by its code only, never the key or the message.
        if (method === 'check_key') log.log('key_check', { code: error.data?.code ?? 'error' })
        return { ok: false, error: { message: error.message, code: error.data?.code, data: error.data } }
      }
      if (method === 'check_key') log.log('key_check', { code: 'error' })
      return { ok: false, error: { message: (error as Error).message } }
    }
  })
  // Every status read goes through the watcher: one at a time, shared by every caller.
  ipcMain.handle('tearsheet:getTools', (_event, force: boolean) => deps.watch.read(Boolean(force)))
  // Whether the screen is waiting on the person (setup, or Home waiting on a tool), so the watcher
  // reads every 5 seconds while the window is in front.
  ipcMain.handle('tearsheet:windowState', (_event, state: unknown) => {
    deps.watch.setWaiting((state as { waiting?: unknown } | null)?.waiting === true)
  })
  // The exact commands for the connect card to show. It only reads; nothing runs.
  ipcMain.handle('tearsheet:commandsFor', async (_event, kinds: unknown): Promise<ToolCommands> => {
    const asked = parseKinds(kinds)
    if (!asked) return NO_COMMANDS
    return toolCommands(asked, await deps.watch.read(), deps.rules)
  })
  // The paste command, built here from the tools' status, copied and checked, then Terminal
  // opened. The window only names the tools.
  ipcMain.handle('tearsheet:copyAndOpenTerminal', async (_event, kinds: unknown): Promise<TerminalResult> => {
    const asked = parseKinds(kinds)
    if (!asked) return { copied: false, opened: false }
    // A sign-in under way is stopped first, so two sign-ins of one tool never run at once; the
    // command is then built from the status read after it.
    await deps.installer?.cancel()
    const command = commandFor(asked, await deps.watch.read(), deps.rules)
    if (!command) return { copied: false, opened: false }
    return copy(command)
  })
  // The Install button (first-run design item 29). The window names the tools, never what to
  // run, and never a link: the sign-in page is the one the running sign-in printed.
  ipcMain.handle('tearsheet:getInstallButton', () => deps.installButton?.() ?? false)
  const installer = deps.installer
  if (installer) {
    ipcMain.handle('tearsheet:install', async (_event, kinds: unknown): Promise<RunResult> => {
      const asked = parseKinds(kinds)
      if (!asked) return { outcome: 'refused' }
      return installer.run(asked)
    })
    ipcMain.handle('tearsheet:cancelInstall', () => installer.cancel())
    ipcMain.handle('tearsheet:openSignInPage', () => installer.openSignInPage())
  }
  // Show log in Finder: logs/setup.log, selected.
  ipcMain.handle('tearsheet:showSetupLog', () => {
    if (!deps.setupLogFile || !existsSync(deps.setupLogFile)) return false
    shell.showItemInFolder(deps.setupLogFile)
    return true
  })
  ipcMain.handle('tearsheet:about', () => about())
  // Opens the person's own Mail with a new email holding the versions; nothing is sent from here.
  ipcMain.handle('tearsheet:sendFeedback', async () => {
    await shell.openExternal(feedbackMailto(about()))
    return true
  })
  // Copy diagnostics (diagnostics.ts): versions, the AI tools and the end of engine.log, scrubbed,
  // onto the clipboard for the person to paste into a feedback email. Nothing is sent anywhere.
  ipcMain.handle('tearsheet:copyDiagnostics', async () => {
    const settings = engine.request<{ primary_tool?: string | null }>('get_settings', {}).catch(() => null)
    const wait = new Promise<null>((resolve) => setTimeout(() => resolve(null), DIAGNOSTICS_WAIT_MS).unref?.())
    const primary = (await Promise.race([settings, wait]))?.primary_tool ?? null
    const text = diagnosticsText({
      about: about(),
      primaryTool: primary,
      tools: deps.watch.current,
      log: deps.engineLogFile ? readLogTail(deps.engineLogFile) : null,
      home: deps.home ?? homedir()
    })
    ;(deps.writeClipboard ?? ((t: string) => clipboard.writeText(t)))(text)
    return true
  })
  ipcMain.handle('tearsheet:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedExternal(url)) return false
    await shell.openExternal(url)
    return true
  })
  // The query of the find session under way, if any. Stopping, or a new page or report in the
  // frame, ends the session, so the next find starts afresh.
  let lastFind: string | null = null
  // The answer comes once the find has finished (or after a second at most), so the window knows
  // when it may put the cursor back in the find field.
  ipcMain.handle('tearsheet:find', (_event, text: unknown, forward: unknown) => {
    const request = findRequest(lastFind, text, forward)
    if (!request) return
    lastFind = request.text
    const id = window.webContents.findInPage(request.text, { forward: request.forward, findNext: request.findNext })
    return new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        if (isOpen(window)) window.webContents.removeListener('found-in-page', onResult)
        resolve()
      }
      const onResult = (_e: unknown, result: Electron.Result) => {
        if (result.requestId === id && result.finalUpdate) finish()
      }
      const timer = setTimeout(finish, 1000)
      window.webContents.on('found-in-page', onResult)
    })
  })
  ipcMain.handle('tearsheet:stopFind', () => {
    lastFind = null
    window.webContents.stopFindInPage('clearSelection')
  })
  window.webContents.on('did-frame-navigate', () => {
    lastFind = null
  })
  engine.on('notification', (note) => notify(window, note))
  // A change in the tools' status reaches the window as a notification, so it never polls.
  deps.watch.on('changed', (tools) => notify(window, { method: 'tools_changed', params: { tools } }))
  engine.on('crashed', (runId) => notify(window, { method: 'engine_restarted', params: { run_id: runId } }))
  engine.on('fatal', (message) => notify(window, { method: 'engine_fatal', params: { message } }))
  // An engine that failed before the window loaded is never lost: every call answers with
  // engine.fatalMessage, and the note is sent again once the page has loaded.
  window.webContents.on('did-finish-load', () => {
    if (engine.fatalMessage) window.webContents.send('tearsheet:notification', { method: 'engine_fatal', params: { message: engine.fatalMessage } })
  })
}
