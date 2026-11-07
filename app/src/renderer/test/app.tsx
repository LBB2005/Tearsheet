// Starts the whole app, as main.tsx does, on the fake bridge (bridge.ts), and waits until it has
// opened on its first page.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect } from 'vitest'

import { App } from '../App'
import { bridge, ok, settings } from './bridge'

// `advanceTimers`: for a test on fake timers (vi.useFakeTimers), so user-event's own waits move them.
export async function renderApp(opts: { setupDone?: boolean; advanceTimers?: (ms: number) => unknown } = {}) {
  if (opts.setupDone === false) bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false })))
  const user = userEvent.setup(opts.advanceTimers ? { advanceTimers: opts.advanceTimers } : {})
  const view = render(<App />)
  await waitFor(() => expect(document.querySelector('.win:not(.on-setup), .setup')).not.toBeNull())
  return { user, ...view }
}

// The app's window element, whose classes say which page is on show and how the sidebar sits.
export const win = () => document.querySelector('.win') as HTMLElement

export const sidebarButton = () => screen.getByRole('button', { name: /the sidebar$/ })

// Open a company's report from the sidebar and wait for it to load.
export async function openReport(user: ReturnType<typeof userEvent.setup>, ticker = 'AAPL') {
  const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
  const row = Array.from(sidebar.querySelectorAll('button')).find((b) => b.querySelector('b')?.textContent === ticker)
  if (!row) throw new Error(`No sidebar row for ${ticker}`)
  await user.click(row)
  await waitFor(() => expect(document.querySelector('iframe.report-frame')).not.toBeNull())
}
