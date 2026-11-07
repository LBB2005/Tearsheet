import { expect, test, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: {}, shell: {} }))

import { engineMethod, findRequest } from './ipc'

test('the call list is closed', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(engineMethod(name)).toBeNull()
  expect(engineMethod(42)).toBeNull()
  expect(engineMethod('getReport')).toBe('get_report')
})

test('the report’s numbers have a call of their own', () => {
  expect(engineMethod('getReportNumbers')).toBe('get_report_numbers')
})

test('a new or changed query starts a find session, and the same query steps through it', () => {
  expect(findRequest(null, 'Hold', true)).toEqual({ text: 'Hold', forward: true, findNext: true })
  expect(findRequest('Hold', 'Hold', true)).toEqual({ text: 'Hold', forward: true, findNext: false })
  expect(findRequest('Hold', 'Hold', false)).toEqual({ text: 'Hold', forward: false, findNext: false })
  expect(findRequest('Hol', 'Hold', true)?.findNext).toBe(true)
})

test('a find needs some text, goes forward unless told otherwise, and is capped at 200 characters', () => {
  expect(findRequest(null, '', true)).toBeNull()
  expect(findRequest(null, 42, true)).toBeNull()
  expect(findRequest(null, 'a', undefined)?.forward).toBe(true)
  const long = 'x'.repeat(250)
  expect(findRequest(null, long, true)?.text).toHaveLength(200)
  expect(findRequest('x'.repeat(200), long, true)?.findNext).toBe(false)
})
