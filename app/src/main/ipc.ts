// The window ↔ main bridge (design item 45): a fixed set of named calls, and nothing else.

import { spawn } from 'node:child_process'

import { BrowserWindow, ipcMain, shell } from 'electron'

import type { Engine } from './engine'
import { EngineError } from './engine'
import { isAllowedExternal } from './external'
import { getTools } from './probe'

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
  fetchHistory: 'fetch_history',
  checkKey: 'check_key',
  runSafetyCheck: 'run_safety_check'
}

// The closed allowlist: only the names above, never inherited object properties.
export function engineMethod(name: unknown): string | null {
  return typeof name === 'string' && Object.hasOwn(CALLS, name) ? CALLS[name] : null
}

export interface CallResult {
  ok: boolean
  result?: unknown
  error?: { message: string; code?: string; data?: Record<string, unknown> }
}

export function registerIpc(window: BrowserWindow, engine: Engine, pathValue: string): void {
  ipcMain.handle('tearsheet:call', async (_event, name: string, params: Record<string, unknown>): Promise<CallResult> => {
    const method = engineMethod(name)
    if (!method) return { ok: false, error: { message: `Unknown call ${name}.` } }
    try {
      const result = await engine.request(method, params ?? {})
      if (method === 'run_report' || method === 'resume') engine.lastRunId = (result as { run_id: string }).run_id
      return { ok: true, result }
    } catch (error) {
      if (error instanceof EngineError) {
        return { ok: false, error: { message: error.message, code: error.data?.code, data: error.data } }
      }
      return { ok: false, error: { message: (error as Error).message } }
    }
  })
  ipcMain.handle('tearsheet:getTools', (_event, force: boolean) => getTools(pathValue, Boolean(force)))
  // Open Terminal only opens the app; nothing is typed or run in it.
  ipcMain.handle('tearsheet:openTerminal', () => {
    spawn('/usr/bin/open', ['/System/Applications/Utilities/Terminal.app'], { stdio: 'ignore', detached: true }).unref()
  })
  ipcMain.handle('tearsheet:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedExternal(url)) return false
    await shell.openExternal(url)
    return true
  })
  ipcMain.handle('tearsheet:find', (_event, text: unknown, forward: unknown) => {
    if (typeof text === 'string' && text) window.webContents.findInPage(text.slice(0, 200), { forward: forward !== false })
  })
  ipcMain.handle('tearsheet:stopFind', () => window.webContents.stopFindInPage('clearSelection'))
  engine.on('notification', (note) => window.webContents.send('tearsheet:notification', note))
  engine.on('crashed', (runId) => window.webContents.send('tearsheet:notification', { method: 'engine_restarted', params: { run_id: runId } }))
  engine.on('fatal', (message) => window.webContents.send('tearsheet:notification', { method: 'engine_fatal', params: { message } }))
}
