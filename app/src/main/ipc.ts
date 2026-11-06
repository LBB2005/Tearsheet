// The window ↔ main bridge (design item 45): a fixed set of named calls, and nothing else.

import { BrowserWindow, ipcMain } from 'electron'

import type { Engine } from './engine'
import { EngineError } from './engine'
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
  gradeDue: 'grade_due'
}

export interface CallResult {
  ok: boolean
  result?: unknown
  error?: { message: string; code?: string; data?: Record<string, unknown> }
}

export function registerIpc(window: BrowserWindow, engine: Engine, pathValue: string): void {
  ipcMain.handle('tearsheet:call', async (_event, name: string, params: Record<string, unknown>): Promise<CallResult> => {
    const method = CALLS[name]
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
  engine.on('notification', (note) => window.webContents.send('tearsheet:notification', note))
  engine.on('crashed', (runId) => window.webContents.send('tearsheet:notification', { method: 'engine_restarted', params: { run_id: runId } }))
  engine.on('fatal', (message) => window.webContents.send('tearsheet:notification', { method: 'engine_fatal', params: { message } }))
}
