import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// The sidebar button sits on two strips that drag the window: the sidebar's top strip
// (.sidedrag, while the sidebar is open) and the toolbar (.top, while it is closed). Chromium
// lists a window's drag and no-drag areas in page order, ignoring z-index, and Electron lets the
// later one win where they overlap. With the button first in the page, both strips came after
// it, so macOS took every real click on it as the start of a window move, and the sidebar never
// closed or opened. Clicks sent over CDP skip the drag areas, so only page order can show it.
test('the sidebar button comes after both drag strips in the page, so a real click reaches it', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const button = app.indexOf('<SidebarButton ')
  expect(button).toBeGreaterThan(0)
  expect(button).toBeGreaterThan(app.search(/<Sidebar\s/))
  expect(button).toBeGreaterThan(app.indexOf('<Toolbar'))
})
