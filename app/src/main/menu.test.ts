import type { MenuItemConstructorOptions } from 'electron'
import { expect, test, vi } from 'vitest'

import { menuTemplate, type MenuCommand } from './menu'

function walk(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((i) => [i, ...(Array.isArray(i.submenu) ? walk(i.submenu) : [])])
}

test('every shortcut in the spec is in the menu', () => {
  const accelerators = walk(menuTemplate(() => undefined, false)).map((i) => i.accelerator)
  for (const a of ['CmdOrCtrl+K', 'CmdOrCtrl+N', 'CmdOrCtrl+1', 'CmdOrCtrl+2', 'CmdOrCtrl+3', 'CmdOrCtrl+[', 'CmdOrCtrl+]', 'Ctrl+Cmd+S', 'CmdOrCtrl+F', 'CmdOrCtrl+,']) {
    expect(accelerators).toContain(a)
  }
})

test('clicking View > Chart sends chart', () => {
  const send = vi.fn<(c: MenuCommand) => void>()
  const chart = walk(menuTemplate(send, false)).find((i) => i.label === 'Chart')
  expect(chart).toBeDefined()
  ;(chart!.click as () => void)()
  expect(send).toHaveBeenCalledWith('chart')
})

test('developer tools only in dev', () => {
  const has = (dev: boolean) => walk(menuTemplate(() => undefined, dev)).some((i) => i.role === 'toggleDevTools')
  expect(has(true)).toBe(true)
  expect(has(false)).toBe(false)
})

test('File > Close window closes the window with ⌘W', () => {
  const file = menuTemplate(() => undefined, false).find((i) => i.label === 'File')
  const items = Array.isArray(file?.submenu) ? file.submenu : []
  const close = items.find((i) => i.role === 'close')
  expect(close).toBeDefined()
  expect(close!.accelerator).toBe('CmdOrCtrl+W')
  expect(items[items.length - 1]).toBe(close) // last, after a separator, as on every Mac app
  expect(items[items.length - 2].type).toBe('separator')
})

test('Help has Tearsheet Help and Send Feedback, last, as on every Mac app', () => {
  const send = vi.fn<(c: MenuCommand) => void>()
  const menus = menuTemplate(send, false)
  const help = menus[menus.length - 1]
  expect(help.role).toBe('help')
  const items = Array.isArray(help.submenu) ? help.submenu : []
  expect(items.map((i) => i.label)).toEqual(['Tearsheet Help', 'Send Feedback…'])
  for (const i of items) (i.click as () => void)()
  expect(send.mock.calls).toEqual([['help'], ['feedback']])
})
