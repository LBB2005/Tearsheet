// The bridge the window gets (design item 45): each named call goes to the main process as the
// engine's method with its parameters in the engine's own names, and the three listeners can be
// taken off again. Electron itself is faked.

import { beforeEach, describe, expect, test, vi } from 'vitest'

const invoke = vi.fn(async (..._args: unknown[]) => ({ ok: true }))
const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
let api: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, value: Record<string, (...args: unknown[]) => unknown>) => {
      if (name === 'tearsheet') api = value
    }
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invoke(...args),
    on: (channel: string, fn: (...args: unknown[]) => void) => {
      if (!handlers.has(channel)) handlers.set(channel, new Set())
      handlers.get(channel)!.add(fn)
    },
    removeListener: (channel: string, fn: (...args: unknown[]) => void) => handlers.get(channel)?.delete(fn)
  }
}))

beforeEach(async () => {
  invoke.mockClear()
  await import('./index')
})

describe('the calls', () => {
  test.each([
    ['runReport', ['AAPL'], ['tearsheet:call', 'runReport', { query: 'AAPL' }]],
    ['runReport', ['AAPL', 'codex'], ['tearsheet:call', 'runReport', { query: 'AAPL', tool: 'codex' }]],
    ['cancel', ['run-1'], ['tearsheet:call', 'cancel', { run_id: 'run-1' }]],
    ['resume', ['run-1'], ['tearsheet:call', 'resume', { run_id: 'run-1' }]],
    ['getReport', ['r-1'], ['tearsheet:call', 'getReport', { report_id: 'r-1' }]],
    ['getReport', ['r-1', { view: 'full', narrow: true }], ['tearsheet:call', 'getReport', { report_id: 'r-1', view: 'full', narrow: true }]],
    ['listCompanies', [], ['tearsheet:call', 'listCompanies', {}]],
    ['searchCompanies', ['app'], ['tearsheet:call', 'searchCompanies', { query: 'app' }]],
    ['searchCompanies', ['app', 5], ['tearsheet:call', 'searchCompanies', { query: 'app', limit: 5 }]],
    ['getChart', ['r-1'], ['tearsheet:call', 'getChart', { report_id: 'r-1' }]],
    ['getReportNumbers', ['r-1'], ['tearsheet:call', 'getReportNumbers', { report_id: 'r-1' }]],
    ['getAnalysts', ['r-1'], ['tearsheet:call', 'getAnalysts', { report_id: 'r-1' }]],
    ['fetchHistory', ['r-1'], ['tearsheet:call', 'fetchHistory', { report_id: 'r-1' }]],
    ['checkKey', ['massive', 'k'], ['tearsheet:call', 'checkKey', { service: 'massive', key: 'k' }]],
    ['runSafetyCheck', ['claude'], ['tearsheet:call', 'runSafetyCheck', { tool: 'claude' }]],
    ['cancelSafetyCheck', [], ['tearsheet:call', 'cancelSafetyCheck', {}]],
    ['windowState', [{ waiting: true }], ['tearsheet:windowState', { waiting: true }]],
    ['windowState', [{ waiting: false }], ['tearsheet:windowState', { waiting: false }]],
    ['copyAndOpenTerminal', [['claude', 'codex']], ['tearsheet:copyAndOpenTerminal', ['claude', 'codex']]],
    ['commandsFor', [['codex']], ['tearsheet:commandsFor', ['codex']]],
    ['showSetupLog', [], ['tearsheet:showSetupLog']],
    ['install', [['claude', 'codex']], ['tearsheet:install', ['claude', 'codex']]],
    ['cancelInstall', [], ['tearsheet:cancelInstall']],
    ['openSignInPage', [], ['tearsheet:openSignInPage']],
    ['getInstallButton', [], ['tearsheet:getInstallButton']],
    ['openExternal', ['https://massive.com'], ['tearsheet:openExternal', 'https://massive.com']],
    ['find', ['rev', false], ['tearsheet:find', 'rev', false]],
    ['stopFind', [], ['tearsheet:stopFind']],
    ['setLook', [{ zoom: 1.1, background: '#0A0D14' }], ['tearsheet:setLook', { zoom: 1.1, background: '#0A0D14' }]],
    ['openTheme', [], ['tearsheet:openTheme']],
    ['saveTheme', ['My look', '{}'], ['tearsheet:saveTheme', 'My look', '{}']],
    ['listReports', [], ['tearsheet:call', 'listReports', {}]],
    ['listReports', [500], ['tearsheet:call', 'listReports', { limit: 500 }]],
    ['listReports', [undefined, true], ['tearsheet:call', 'listReports', { hidden: true }]],
    ['listReports', [50, false], ['tearsheet:call', 'listReports', { limit: 50 }]],
    ['hideReports', [['r1', 'r2']], ['tearsheet:call', 'hideReports', { report_ids: ['r1', 'r2'] }]],
    ['showReports', [['r1']], ['tearsheet:call', 'showReports', { report_ids: ['r1'] }]],
    ['eraseReports', [['r1']], ['tearsheet:call', 'eraseReports', { report_ids: ['r1'] }]],
    ['pinCompany', [320193, true], ['tearsheet:call', 'pinCompany', { cik: 320193, pinned: true }]],
    ['planLine', [['JPM', 'O']], ['tearsheet:call', 'planLine', { queries: ['JPM', 'O'] }]],
    ['addToLine', [['JPM']], ['tearsheet:call', 'addToLine', { queries: ['JPM'] }]],
    ['getLine', [], ['tearsheet:call', 'getLine', {}]],
    ['removeFromLine', ['O'], ['tearsheet:call', 'removeFromLine', { ticker: 'O' }]],
    ['clearLine', [], ['tearsheet:call', 'clearLine', {}]],
    ['carryOnLine', [], ['tearsheet:call', 'carryOnLine', {}]],
    ['listPredictions', [], ['tearsheet:call', 'listPredictions', {}]],
    ['predictionPrices', [[1, 2], '2026-01-01'], ['tearsheet:call', 'predictionPrices', { ciks: [1, 2], since: '2026-01-01' }]],
    ['flagClaim', ['r-1:c1', 'wrong'], ['tearsheet:call', 'flagClaim', { claim_id: 'r-1:c1', note: 'wrong' }]],
    ['rereadFiling', ['0001'], ['tearsheet:call', 'rereadFiling', { accession: '0001' }]],
    ['getTools', [], ['tearsheet:getTools', false]],
    ['getTools', [true], ['tearsheet:getTools', true]],
    ['setKey', ['fred', 'k'], ['tearsheet:call', 'setKey', { service: 'fred', key: 'k' }]],
    ['getSettings', [], ['tearsheet:call', 'getSettings', {}]],
    ['setSetting', ['raw_cap', '20'], ['tearsheet:call', 'setSetting', { key: 'raw_cap', value: '20' }]],
    ['gradeDue', [], ['tearsheet:call', 'gradeDue', {}]],
    ['showDownload', ['/Users/x/Downloads/JPM Tearsheet 7 Nov 2026.pdf'], ['tearsheet:showDownload', '/Users/x/Downloads/JPM Tearsheet 7 Nov 2026.pdf']]
  ])('%s(%j) goes to the main process as it should', async (name, args, sent) => {
    await api[name](...args)
    expect(invoke).toHaveBeenCalledWith(...sent)
  })
})

describe('the listeners', () => {
  test.each([
    ['onNotification', 'tearsheet:notification', { method: 'progress', params: {} }],
    ['onFlagRequested', 'tearsheet:flag-requested', { claimId: 'c1' }],
    ['onOpenView', 'tearsheet:open-view', { view: 'factors', item: null }],
    ['onMenu', 'tearsheet:menu', 'chart'],
    ['onDownload', 'tearsheet:download', { state: 'saving', kind: 'pdf', reportId: 'rep-1' }]
  ])('%s hears %s until it is taken off', (name, channel, payload) => {
    const fn = vi.fn()
    const off = api[name](fn) as () => void
    for (const h of handlers.get(channel) ?? []) h({}, payload)
    expect(fn).toHaveBeenCalledWith(payload)
    off()
    expect(handlers.get(channel)?.size).toBe(0)
  })
})

test('About and help asks main for the versions, and Send feedback asks it to open Mail', async () => {
  await api.about()
  expect(invoke).toHaveBeenLastCalledWith('tearsheet:about')
  await api.sendFeedback()
  expect(invoke).toHaveBeenLastCalledWith('tearsheet:sendFeedback')
})

test('the window gets nothing but these calls and listeners', () => {
  expect(Object.keys(api).sort()).toEqual(
    ['addToLine', 'cancel', 'carryOnLine', 'checkKey', 'clearLine', 'getLine', 'planLine', 'removeFromLine', 'fetchHistory', 'find', 'flagClaim', 'getAnalysts', 'getChart', 'getReport', 'getReportNumbers', 'eraseReports', 'getSettings', 'getTools', 'gradeDue', 'hideReports', 'listCompanies', 'listPredictions', 'listReports', 'predictionPrices', 'saveCsv', 'onFlagRequested', 'onMenu', 'onNotification', 'onOpenView', 'openExternal', 'pinCompany', 'rereadFiling', 'resume', 'runReport', 'runSafetyCheck', 'searchCompanies', 'setKey', 'setSetting', 'showReports', 'stopFind', 'setLook', 'openTheme', 'saveTheme', 'onDownload', 'showDownload', 'about', 'sendFeedback', 'cancelSafetyCheck', 'windowState', 'copyAndOpenTerminal', 'commandsFor', 'showSetupLog', 'install', 'cancelInstall', 'openSignInPage', 'getInstallButton'].sort()
  )
})
