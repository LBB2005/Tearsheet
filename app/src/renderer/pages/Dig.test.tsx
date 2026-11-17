// Dig deeper (pages/Dig.tsx): the research step for one stock. It opens from the stock menu, a
// Watchlist company's panel and the report's toolbar, and shows the engine's newest snapshot.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { openReport, renderApp } from '../test/app'
import { bridge } from '../test/bridge'

const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
const digPage = () => screen.findByRole('region', { name: /^Dig deeper/ })

describe('opening it', () => {
  test('from a stock’s right-click menu', async () => {
    const { user } = await renderApp()
    const row = (await sidebar().findAllByRole('button', { name: /^MSFT/ }))[0]
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 })
    await user.click(within(screen.getByRole('menu', { name: 'MSFT options' })).getByRole('menuitem', { name: 'Dig deeper' }))
    expect(await digPage()).toHaveAccessibleName('Dig deeper: MSFT')
    expect(bridge.getDigDeeper).toHaveBeenCalledWith(789019)
  })

  test('from a Watchlist company’s panel', async () => {
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Watchlist/ }))
    await screen.findByRole('navigation', { name: 'Watchlists' })
    await user.click(screen.getAllByRole('button', { name: /^AMD/ })[0])
    const panel = document.querySelector('.watchv .wdet') as HTMLElement
    await user.click(within(panel).getByRole('button', { name: 'Dig deeper' }))
    await digPage()
    expect(bridge.getDigDeeper).toHaveBeenCalledWith(2488)
  })

  test('from the report’s toolbar', async () => {
    const { user } = await renderApp()
    await openReport(user, 'AAPL')
    await user.click(await screen.findByRole('button', { name: 'Dig deeper' }))
    await digPage()
    expect(bridge.getDigDeeper).toHaveBeenCalledWith(320193)
  })

  test('on the page, its own menu greys Dig deeper', async () => {
    const { user } = await renderApp()
    await openReport(user, 'AAPL')
    await user.click(await screen.findByRole('button', { name: 'Dig deeper' }))
    const page = await digPage()
    fireEvent.contextMenu(within(page).getByRole('heading', { level: 2 }))
    const item = within(screen.getByRole('menu', { name: 'AAPL options' })).getByRole('menuitem', { name: /Dig deeper/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveTextContent('Open now')
    await waitFor(() => expect(bridge.getDigDeeper).toHaveBeenCalledTimes(1))
  })
})
