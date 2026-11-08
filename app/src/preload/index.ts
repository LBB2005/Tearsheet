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
  fetchHistory: (reportId: string) => call('fetchHistory', { report_id: reportId }),
  checkKey: (service: string, key: string) => call('checkKey', { service, key }),
  runSafetyCheck: (tool: string) => call('runSafetyCheck', { tool }),
  openTerminal: () => ipcRenderer.invoke('tearsheet:openTerminal'),
  openExternal: (url: string) => ipcRenderer.invoke('tearsheet:openExternal', url),
  find: (text: string, forward: boolean) => ipcRenderer.invoke('tearsheet:find', text, forward),
  stopFind: () => ipcRenderer.invoke('tearsheet:stopFind'),
  listReports: (limit?: number, hidden?: boolean) => call('listReports', { ...(limit === undefined ? {} : { limit }), ...(hidden ? { hidden: true } : {}) }),
  hideReports: (reportIds: string[]) => call('hideReports', { report_ids: reportIds }),
  showReports: (reportIds: string[]) => call('showReports', { report_ids: reportIds }),
  eraseReports: (reportIds: string[]) => call('eraseReports', { report_ids: reportIds }),
  pinCompany: (cik: number, pinned: boolean) => call('pinCompany', { cik, pinned }),
  listPredictions: () => call('listPredictions', {}),
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
  onMenu: listen('tearsheet:menu')
})
