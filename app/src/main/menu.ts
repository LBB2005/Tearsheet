// The Mac menus. Items are menu accelerators, so shortcuts work only while Tearsheet is in front.

import type { MenuItemConstructorOptions } from 'electron'

export type MenuCommand = 'new' | 'lookup' | 'summary' | 'full' | 'chart' | 'prev' | 'next' | 'log' | 'watch' | 'sidebar' | 'find' | 'settings' | 'help' | 'feedback'

export function menuTemplate(send: (c: MenuCommand) => void, isDev: boolean): MenuItemConstructorOptions[] {
  const item = (label: string, accelerator: string, command: MenuCommand): MenuItemConstructorOptions => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => send(command)
  })
  return [
    {
      label: 'Tearsheet',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        item('Settings…', 'CmdOrCtrl+,', 'settings'),
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [item('New report', 'CmdOrCtrl+N', 'new'), item('Look up', 'CmdOrCtrl+K', 'lookup'), { type: 'separator' }, { role: 'close', accelerator: 'CmdOrCtrl+W' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find', 'CmdOrCtrl+F', 'find')
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Summary', 'CmdOrCtrl+1', 'summary'),
        item('Full report', 'CmdOrCtrl+2', 'full'),
        item('Chart', 'CmdOrCtrl+3', 'chart'),
        { type: 'separator' },
        item('Show or hide the sidebar', 'Ctrl+Cmd+S', 'sidebar'),
        ...(isDev ? ([{ type: 'separator' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]) : [])
      ]
    },
    {
      label: 'Go',
      submenu: [item('Previous company', 'CmdOrCtrl+[', 'prev'), item('Next company', 'CmdOrCtrl+]', 'next'), { type: 'separator' }, item('Watchlist', 'CmdOrCtrl+J', 'watch'), item('Prediction log', 'CmdOrCtrl+L', 'log')]
    },
    { role: 'windowMenu' },
    // Help: Settings → About and help, and a feedback email in the person's own Mail
    // (docs/launch/launch-readiness.md, M8-M9).
    { role: 'help', submenu: [item('Tearsheet Help', '', 'help'), item('Send Feedback…', '', 'feedback')] }
  ]
}
