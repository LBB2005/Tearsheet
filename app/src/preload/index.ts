// What the window may use (design item 45): named calls and two listeners. No other Node or
// Electron access is exposed.

import { contextBridge, ipcRenderer } from 'electron'

const call = (name: string, params: Record<string, unknown> = {}) => ipcRenderer.invoke('tearsheet:call', name, params)

function listen(channel: string) {
  return (fn: (payload: unknown) => void) => {
    const handler = (_event: unknown, payload: unknown) => fn(payload)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

contextBridge.exposeInMainWorld('tearsheet', {
  runReport: (query: string, tool?: string) => call('runReport', tool ? { query, tool } : { query }),
  cancel: (runId: string) => call('cancel', { run_id: runId }),
  resume: (runId: string) => call('resume', { run_id: runId }),
  getReport: (reportId: string, opts: { view?: string; column?: string; narrow?: boolean; side?: string; motion?: boolean } = {}) => call('getReport', { report_id: reportId, ...opts }),
  listCompanies: () => call('listCompanies', {}),
  searchCompanies: (query: string, limit?: number) => call('searchCompanies', limit === undefined ? { query } : { query, limit }),
  getChart: (reportId: string) => call('getChart', { report_id: reportId }),
  getReportNumbers: (reportId: string) => call('getReportNumbers', { report_id: reportId }),
  getAnalysts: (reportId: string) => call('getAnalysts', { report_id: reportId }),
  fetchHistory: (reportId: string) => call('fetchHistory', { report_id: reportId }),
  checkKey: (service: string, key: string) => call('checkKey', { service, key }),
  runSafetyCheck: (tool: string) => call('runSafetyCheck', { tool }),
  cancelSafetyCheck: () => call('cancelSafetyCheck', {}),
  // First-run setup (first-run design item 15). The window names the tools; the main process
  // builds every command itself.
  windowState: (state: { waiting: boolean }) => ipcRenderer.invoke('tearsheet:windowState', { waiting: state?.waiting === true }),
  copyAndOpenTerminal: (kinds: string[]) => ipcRenderer.invoke('tearsheet:copyAndOpenTerminal', kinds),
  commandsFor: (kinds: string[]) => ipcRenderer.invoke('tearsheet:commandsFor', kinds),
  showSetupLog: () => ipcRenderer.invoke('tearsheet:showSetupLog'),
  // The Install button (first-run design item 29). Progress arrives as install_progress
  // notifications. With the build's switch off, install, cancelInstall and openSignInPage have no
  // handler in the main process, so they reject; getInstallButton then answers false.
  install: (kinds: string[]) => ipcRenderer.invoke('tearsheet:install', kinds),
  cancelInstall: () => ipcRenderer.invoke('tearsheet:cancelInstall'),
  openSignInPage: () => ipcRenderer.invoke('tearsheet:openSignInPage'),
  getInstallButton: () => ipcRenderer.invoke('tearsheet:getInstallButton'),
  openExternal: (url: string) => ipcRenderer.invoke('tearsheet:openExternal', url),
  about: () => ipcRenderer.invoke('tearsheet:about'),
  sendFeedback: () => ipcRenderer.invoke('tearsheet:sendFeedback'),
  copyDiagnostics: () => ipcRenderer.invoke('tearsheet:copyDiagnostics'),
  find: (text: string, forward: boolean) => ipcRenderer.invoke('tearsheet:find', text, forward),
  stopFind: () => ipcRenderer.invoke('tearsheet:stopFind'),
  setLook: (look: { zoom: number; background: string }) => ipcRenderer.invoke('tearsheet:setLook', look),
  openTheme: () => ipcRenderer.invoke('tearsheet:openTheme'),
  saveTheme: (name: string, text: string) => ipcRenderer.invoke('tearsheet:saveTheme', name, text),
  listReports: (limit?: number, hidden?: boolean) => call('listReports', { ...(limit === undefined ? {} : { limit }), ...(hidden ? { hidden: true } : {}) }),
  hideReports: (reportIds: string[]) => call('hideReports', { report_ids: reportIds }),
  showReports: (reportIds: string[]) => call('showReports', { report_ids: reportIds }),
  eraseReports: (reportIds: string[]) => call('eraseReports', { report_ids: reportIds }),
  pinCompany: (cik: number, pinned: boolean) => call('pinCompany', { cik, pinned }),
  planLine: (queries: string[], opts: { group?: string; sector?: string; skipRecent?: boolean } = {}) =>
    call('planLine', { queries, ...(opts.group ? { group: opts.group } : {}), ...(opts.sector ? { sector: opts.sector } : {}), ...(opts.skipRecent ? { skip_recent: true } : {}) }),
  addToLine: (queries: string[]) => call('addToLine', { queries }),
  getLine: () => call('getLine', {}),
  removeFromLine: (ticker: string) => call('removeFromLine', { ticker }),
  clearLine: () => call('clearLine', {}),
  carryOnLine: () => call('carryOnLine', {}),
  lineGroups: () => call('lineGroups', {}),
  listPredictions: () => call('listPredictions', {}),
  predictionPrices: (ciks: number[], since: string) => call('predictionPrices', { ciks, since }),
  // The prediction log's Export: a CSV the window made, saved to ~/Downloads (main/downloads.ts).
  saveCsv: (name: string, text: string) => ipcRenderer.invoke('tearsheet:saveCsv', name, text),
  flagClaim: (claimId: string, note: string) => call('flagClaim', { claim_id: claimId, note }),
  rereadFiling: (accession: string) => call('rereadFiling', { accession }),
  getTools: (force = false) => ipcRenderer.invoke('tearsheet:getTools', force),
  setKey: (service: string, key: string) => call('setKey', { service, key }),
  getSettings: () => call('getSettings', {}),
  setSetting: (key: string, value: string) => call('setSetting', { key, value }),
  gradeDue: () => call('gradeDue', {}),
  onNotification: listen('tearsheet:notification'),
  onFlagRequested: listen('tearsheet:flag-requested'),
  onOpenView: listen('tearsheet:open-view'),
  // How a download from the end of the report went (main/downloads.ts), and Show in Finder.
  onDownload: listen('tearsheet:download'),
  showDownload: (path: string) => ipcRenderer.invoke('tearsheet:showDownload', path),
  onMenu: listen('tearsheet:menu')
})
