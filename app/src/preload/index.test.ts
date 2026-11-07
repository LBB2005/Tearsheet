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
    ['fetchHistory', ['r-1'], ['tearsheet:call', 'fetchHistory', { report_id: 'r-1' }]],
    ['checkKey', ['massive', 'k'], ['tearsheet:call', 'checkKey', { service: 'massive', key: 'k' }]],
    ['runSafetyCheck', ['claude'], ['tearsheet:call', 'runSafetyCheck', { tool: 'claude' }]],
    ['openTerminal', [], ['tearsheet:openTerminal']],
    ['openExternal', ['https://massive.com'], ['tearsheet:openExternal', 'https://massive.com']],
    ['find', ['rev', false], ['tearsheet:find', 'rev', false]],
    ['stopFind', [], ['tearsheet:stopFind']],
    ['listReports', [], ['tearsheet:call', 'listReports', {}]],
    ['listReports', [500], ['tearsheet:call', 'listReports', { limit: 500 }]],
    ['listPredictions', [], ['tearsheet:call', 'listPredictions', {}]],
    ['flagClaim', ['r-1:c1', 'wrong'], ['tearsheet:call', 'flagClaim', { claim_id: 'r-1:c1', note: 'wrong' }]],
    ['rereadFiling', ['0001'], ['tearsheet:call', 'rereadFiling', { accession: '0001' }]],
    ['getTools', [], ['tearsheet:getTools', false]],
    ['getTools', [true], ['tearsheet:getTools', true]],
    ['setKey', ['fred', 'k'], ['tearsheet:call', 'setKey', { service: 'fred', key: 'k' }]],
    ['getSettings', [], ['tearsheet:call', 'getSettings', {}]],
    ['setSetting', ['raw_cap', '20'], ['tearsheet:call', 'setSetting', { key: 'raw_cap', value: '20' }]],
    ['gradeDue', [], ['tearsheet:call', 'gradeDue', {}]]
  ])('%s(%j) goes to the main process as it should', async (name, args, sent) => {
    await api[name](...args)
    expect(invoke).toHaveBeenCalledWith(...sent)
  })
})

describe('the listeners', () => {
  test.each([
    ['onNotification', 'tearsheet:notification', { method: 'progress', params: {} }],
    ['onFlagRequested', 'tearsheet:flag-requested', { claimId: 'c1' }],
    ['onMenu', 'tearsheet:menu', 'chart']
  ])('%s hears %s until it is taken off', (name, channel, payload) => {
    const fn = vi.fn()
    const off = api[name](fn) as () => void
    for (const h of handlers.get(channel) ?? []) h({}, payload)
    expect(fn).toHaveBeenCalledWith(payload)
    off()
    expect(handlers.get(channel)?.size).toBe(0)
  })
})

test('the window gets nothing but these calls and listeners', () => {
  expect(Object.keys(api).sort()).toEqual(
    ['cancel', 'checkKey', 'fetchHistory', 'find', 'flagClaim', 'getChart', 'getReport', 'getSettings', 'getTools', 'gradeDue', 'listCompanies', 'listPredictions', 'listReports', 'onFlagRequested', 'onMenu', 'onNotification', 'openExternal', 'openTerminal', 'rereadFiling', 'resume', 'runReport', 'runSafetyCheck', 'searchCompanies', 'setKey', 'setSetting', 'stopFind'].sort()
  )
})
