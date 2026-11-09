// Starts the whole app, as main.tsx does, on the fake bridge (bridge.ts), and waits until it has
// opened on its first page.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect } from 'vitest'

import { App } from '../App'
import { bridge, ok, settings } from './bridge'

// Every click a test makes through `user.click`, so the setup tests can hold each journey to its
// click count (first-run design Goal 1). Typing, ⌘V and Return don't count, as in the design.
export interface Clicks {
  count: () => number
  reset: () => void
}

type User = ReturnType<typeof userEvent.setup>

// `user.click`, counted. user-event's own clicks (inside user.type) aren't counted: a test types
// into a field the focus already moved to, or clicks it first on purpose.
function countClicks(user: User): { user: User; clicks: Clicks } {
  let n = 0
  const counted: User = {
    ...user,
    click: async (element: Element) => {
      n += 1
      await user.click(element)
    }
  }
  const clicks = {
    count: () => n,
    reset: () => {
      n = 0
    }
  }
  return { user: counted, clicks }
}

// `advanceTimers`: for a test on fake timers (vi.useFakeTimers), so user-event's own waits move them.
export async function renderApp(opts: { setupDone?: boolean; advanceTimers?: (ms: number) => unknown } = {}) {
  if (opts.setupDone === false) bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false })))
  const { user, clicks } = countClicks(userEvent.setup(opts.advanceTimers ? { advanceTimers: opts.advanceTimers } : {}))
  const view = render(<App />)
  await waitFor(() => expect(document.querySelector('.win:not(.on-setup), .setup')).not.toBeNull())
  return { user, clicks, ...view }
}

// The app's window element, whose classes say which page is on show and how the sidebar sits.
export const win = () => document.querySelector('.win') as HTMLElement

export const sidebarButton = () => screen.getByRole('button', { name: /the sidebar$/ })

// Open a company's report from the sidebar and wait for it to load.
export async function openReport(user: User, ticker = 'AAPL') {
  const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
  const row = Array.from(sidebar.querySelectorAll('button')).find((b) => b.querySelector('b')?.textContent === ticker)
  if (!row) throw new Error(`No sidebar row for ${ticker}`)
  await user.click(row)
  await waitFor(() => expect(document.querySelector('iframe.report-frame')).not.toBeNull())
}
