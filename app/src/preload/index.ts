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
  getReport: (reportId: string) => call('getReport', { report_id: reportId }),
  listReports: () => call('listReports', {}),
  listPredictions: () => call('listPredictions', {}),
  flagClaim: (claimId: string, note: string) => call('flagClaim', { claim_id: claimId, note }),
  rereadFiling: (accession: string) => call('rereadFiling', { accession }),
  getTools: (force = false) => ipcRenderer.invoke('tearsheet:getTools', force),
  setKey: (service: string, key: string) => call('setKey', { service, key }),
  getSettings: () => call('getSettings', {}),
  setSetting: (key: string, value: string) => call('setSetting', { key, value }),
  gradeDue: () => call('gradeDue', {}),
  onNotification: listen('tearsheet:notification'),
  onFlagRequested: listen('tearsheet:flag-requested')
})
