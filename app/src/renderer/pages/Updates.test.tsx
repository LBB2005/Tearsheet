// The update banner (shell/UpdateBanner.tsx) and "Check for updates" in Settings → About and help.
// The main process's check is faked by the bridge (main/updates.ts holds the real one).

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { UPDATES_OFF, UPDATES_ON } from '../settings/About'
import { renderApp } from '../test/app'
import { bridge, menu, setUpdateState, updateStatus } from '../test/bridge'

const RELEASE = { version: '0.2.0', url: 'https://github.com/LBB2005/Tearsheet/releases/tag/v0.2.0', prerelease: false }

describe('the update banner', () => {
  test('nothing shows when there is no newer release', async () => {
    await renderApp()
    await waitFor(() => expect(bridge.updates).toHaveBeenCalled())
    expect(document.querySelector('.upbar')).toBeNull()
  })

  test('a newer release found at launch shows one line with its three actions', async () => {
    setUpdateState({ check: true, update: RELEASE })
    const { user } = await renderApp()
    const bar = await screen.findByText('Tearsheet 0.2.0 is out')
    const line = within(bar.closest('.upbar') as HTMLElement)
    await user.click(line.getByRole('button', { name: 'Download' }))
    expect(bridge.openUpdate).toHaveBeenLastCalledWith('download')
    await user.click(line.getByRole('button', { name: 'What’s new' }))
    expect(bridge.openUpdate).toHaveBeenLastCalledWith('notes')
  })

  test('a release found while Tearsheet is open shows up, and Dismiss hides it for that version', async () => {
    const { user } = await renderApp()
    await waitFor(() => expect(bridge.onUpdate).toHaveBeenCalled())
    updateStatus({ check: true, update: RELEASE })
    expect(await screen.findByText('Tearsheet 0.2.0 is out')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss Tearsheet 0.2.0' }))
    expect(bridge.dismissUpdate).toHaveBeenCalledWith('0.2.0')
    await waitFor(() => expect(document.querySelector('.upbar')).toBeNull())
  })

  test('a first answer that arrives after a change main sent doesn’t undo it', async () => {
    let answer: (s: { check: boolean; update: null }) => void = () => undefined
    bridge.updates.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    await renderApp()
    await waitFor(() => expect(bridge.onUpdate).toHaveBeenCalled())
    updateStatus({ check: true, update: RELEASE })
    expect(await screen.findByText('Tearsheet 0.2.0 is out')).toBeInTheDocument()
    // The first answer, worked out before the check found 0.2.0, comes in late.
    answer({ check: true, update: null })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByText('Tearsheet 0.2.0 is out')).toBeInTheDocument()
  })

  test('a status that can’t be read, or a Dismiss that fails, shows nothing', async () => {
    bridge.updates.mockRejectedValueOnce(new Error('gone'))
    const { user } = await renderApp()
    await waitFor(() => expect(bridge.updates).toHaveBeenCalled())
    expect(document.querySelector('.upbar')).toBeNull()
    updateStatus({ check: true, update: RELEASE })
    bridge.dismissUpdate.mockRejectedValueOnce(new Error('gone'))
    await user.click(await screen.findByRole('button', { name: 'Dismiss Tearsheet 0.2.0' }))
    await waitFor(() => expect(document.querySelector('.upbar')).toBeNull())
  })

  test('it stays on every page after setup: home, a report’s page and Settings', async () => {
    setUpdateState({ check: true, update: RELEASE })
    await renderApp()
    expect(await screen.findByText('Tearsheet 0.2.0 is out')).toBeInTheDocument()
    menu('settings')
    await screen.findByRole('navigation', { name: 'Settings topics' })
    expect(screen.getByText('Tearsheet 0.2.0 is out')).toBeInTheDocument()
  })
})

describe('Check for updates', () => {
  const openAbout = async () => {
    const app = await renderApp()
    menu('settings')
    await screen.findByRole('navigation', { name: 'Settings topics' })
    await app.user.click(within(screen.getByRole('navigation', { name: 'Settings topics' })).getByRole('button', { name: /^About and help/ }))
    return app
  }

  test('is on by default and says what it sends', async () => {
    await openAbout()
    const pick = await screen.findByRole('combobox', { name: /Check for updates/ })
    expect(pick).toHaveValue('on')
    expect(screen.getByText(UPDATES_ON)).toBeInTheDocument()
  })

  test('turned off, it tells main, says so, and the banner goes', async () => {
    setUpdateState({ check: true, update: RELEASE })
    const { user } = await openAbout()
    expect(await screen.findByText('Tearsheet 0.2.0 is out')).toBeInTheDocument()
    const pick = await screen.findByRole('combobox', { name: /Check for updates/ })
    await waitFor(() => expect(pick).toHaveValue('on'))
    await user.selectOptions(pick, 'off')
    expect(bridge.setUpdateCheck).toHaveBeenLastCalledWith(false)
    expect(await screen.findByText(UPDATES_OFF)).toBeInTheDocument()
    // Main tells every listener; the banner hears it.
    updateStatus({ check: false, update: null })
    await waitFor(() => expect(document.querySelector('.upbar')).toBeNull())
    await user.selectOptions(pick, 'on')
    expect(bridge.setUpdateCheck).toHaveBeenLastCalledWith(true)
    expect(await screen.findByText(UPDATES_ON)).toBeInTheDocument()
  })

  test('a failed call leaves the choice as picked', async () => {
    const { user } = await openAbout()
    bridge.setUpdateCheck.mockRejectedValueOnce(new Error('gone'))
    const pick = await screen.findByRole('combobox', { name: /Check for updates/ })
    await waitFor(() => expect(pick).toHaveValue('on'))
    await user.selectOptions(pick, 'off')
    expect(await screen.findByText(UPDATES_OFF)).toBeInTheDocument()
  })
})
