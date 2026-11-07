// The one-click install screen. It is built but switched off (ONE_CLICK_ENABLED in steps.ts), so
// setup never shows it yet; these pin how it behaves for when it is switched on.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { TOOLS } from '../test/bridge'
import { ONE_CLICK_ENABLED } from './steps'
import { OneClick } from './tool'

const claude = TOOLS[0]
const missing = { ...claude, available: false, loggedIn: null, version: null }

describe('the one-click install screen', () => {
  test('is still switched off', () => {
    expect(ONE_CLICK_ENABLED).toBe(false)
  })

  test('shows the exact commands, and its button waits for an installer', () => {
    render(<OneClick kind="claude" tool={missing} onManual={vi.fn()} onContinue={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Add Claude Code' })).toBeInTheDocument()
    expect(screen.getByText('curl -fsSL https://claude.ai/install.sh | bash')).toBeInTheDocument()
    expect(screen.getByText('claude auth login')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install and sign in' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  test('installs, waits for the sign-in, then carries on', async () => {
    const user = userEvent.setup()
    const onInstall = vi.fn()
    const onContinue = vi.fn()
    const onManual = vi.fn()
    const { rerender } = render(<OneClick kind="claude" tool={missing} onInstall={onInstall} onManual={onManual} onContinue={onContinue} />)
    await user.click(screen.getByRole('button', { name: 'Install and sign in' }))
    expect(onInstall).toHaveBeenCalled()
    expect(screen.getByText('Installing, about a minute')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install and sign in' })).toBeDisabled()

    rerender(<OneClick kind="claude" tool={{ ...claude, loggedIn: false }} onInstall={onInstall} onManual={onManual} onContinue={onContinue} />)
    expect(screen.getByText('Waiting for you to sign in, in your browser')).toBeInTheDocument()

    rerender(<OneClick kind="claude" tool={claude} onInstall={onInstall} onManual={onManual} onContinue={onContinue} />)
    expect(screen.getByText('Installed and signed in to your Claude plan')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Do it myself in Terminal' }))
    expect(onManual).toHaveBeenCalled()
  })
})
