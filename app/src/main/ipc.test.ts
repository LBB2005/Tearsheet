import { expect, test, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: {}, shell: {} }))

import { engineMethod } from './ipc'

test('the call list is closed', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(engineMethod(name)).toBeNull()
  expect(engineMethod(42)).toBeNull()
  expect(engineMethod('getReport')).toBe('get_report')
})
