// Settings → Appearance (version B, the look gallery), driven as a person would: the looks, the
// common choices, Customize's four tabs, theme files in and out, Reset and Undo. The app is opened
// on the fake bridge; the main process's open and save panels are faked there too.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import { reloadAppearance, startAppearance } from '../appearance/store'
import { DEFAULT_APPEARANCE, themeText } from '../appearance/themeFile'
import { openReport, renderApp } from '../test/app'
import { bridge, fail, menu, ok, settings } from '../test/bridge'

const html = () => document.documentElement
const token = (name: string) => html().style.getPropertyValue(name)

// As main.tsx does at start-up: the stored look (none) on <html>.
beforeEach(() => {
  html().removeAttribute('style')
  reloadAppearance()
  startAppearance()
})

async function openAppearance(settingsWork = true) {
  bridge.getSettings.mockResolvedValue(ok(settings()))
  const app = await renderApp()
  if (!settingsWork) bridge.getSettings.mockResolvedValue(fail('The engine is busy.'))
  menu('settings')
  const nav = await screen.findByRole('navigation', { name: 'Settings topics' })
  await app.user.click(within(nav).getByRole('button', { name: /^Appearance/ }))
  await screen.findByRole('heading', { level: 2, name: 'Appearance' })
  return app
}

const looks = () => within(screen.getByRole('group', { name: 'Looks' }))
const card = (name: string) => looks().getByRole('button', { name: new RegExp(`^${name}`) })
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const slider = (name: string) => screen.getByRole('slider', { name })

describe('the looks', () => {
  test('six looks, then Import a theme; one goes on at once and is named', async () => {
    const { user } = await openAppearance()
    expect(looks().getAllByRole('button').map((b) => b.querySelector('.nm')?.firstChild?.textContent)).toEqual(['Tearsheet', 'Graphite', 'Evergreen', 'Amber', 'Dusk', 'High contrast', 'Import a theme…'])
    expect(card('Tearsheet')).toHaveAttribute('aria-pressed', 'true')
    await user.click(card('Graphite'))
    expect(card('Graphite')).toHaveAttribute('aria-pressed', 'true')
    expect(token('--bg')).toBe('#0F1012')
    // A look as it comes needs no name under the cards; a changed one does.
    expect(document.querySelector('.lookline')).toHaveTextContent(/^$/)
    expect(JSON.parse(localStorage.getItem('appearance.look')!)['based-on']).toBe('graphite')
  })

  test('Dark, Light or Match the Mac', async () => {
    const { user } = await openAppearance()
    const mode = within(screen.getByRole('group', { name: 'Light or dark' }))
    await user.click(mode.getByRole('button', { name: 'Light' }))
    expect(html().dataset.shade).toBe('light')
    expect(token('--text')).toBe('#0E1726')
    expect(bridge.setLook).toHaveBeenLastCalledWith({ zoom: 1, background: '#E8EDF2' })
    await user.click(mode.getByRole('button', { name: 'Match the Mac' }))
    expect(html().dataset.shade).toBe('dark')
    expect(mode.getByRole('button', { name: 'Match the Mac' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('opens even when the engine can’t give the other settings', async () => {
    const { user } = await openAppearance(false)
    expect(card('Tearsheet')).toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Settings topics' })).getByRole('button', { name: /^General/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings didn’t load. The engine is busy.')
  })
})

describe('the common choices', () => {
  test('glow and text size, with their values beside them', async () => {
    await openAppearance()
    expect(slider('Glow')).toHaveValue('40')
    fireEvent.change(slider('Glow'), { target: { value: '70' } })
    expect(token('--glow')).toBe('.7')
    expect(screen.getByText('70%')).toBeInTheDocument()
    fireEvent.change(slider('Text size'), { target: { value: '120' } })
    expect(bridge.setLook).toHaveBeenLastCalledWith({ zoom: 1.2, background: '#0A0D14' })
  })

  test('a swatch the same as the look’s own accent isn’t shown twice', async () => {
    const { user } = await openAppearance()
    expect(screen.queryByRole('button', { name: 'Teal' })).toBeNull()
    expect(button('The look’s own')).toHaveAttribute('aria-pressed', 'true')
    await user.click(card('Graphite'))
    expect(button('Teal')).toBeInTheDocument()
  })

  test('an accent swatch, or any colour; then Save as a look… names it', async () => {
    const { user } = await openAppearance()
    await user.click(button('Pink'))
    expect(token('--accent')).toBe('#FF9EC7')
    expect(button('Pink')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Custom, based on Tearsheet')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Any accent colour'), { target: { value: '#ff5500' } })
    expect(token('--accent')).toBe('#FF5500')
    expect(button('Pink')).toHaveAttribute('aria-pressed', 'false')

    await user.click(button('Save as a look…'))
    const name = screen.getByRole('textbox', { name: 'Name for this look' })
    expect(name).toHaveValue('My look')
    await user.clear(name)
    await user.type(name, 'Sunset{Enter}')
    expect(card('Sunset')).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Saved “Sunset”')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save as a look…' })).toBeNull()
  })

  test('Escape or Cancel leaves the name field without saving', async () => {
    const { user } = await openAppearance()
    await user.click(button('Mint'))
    await user.click(button('Save as a look…'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Name for this look' })).toBeNull()
    await user.click(button('Save as a look…'))
    await user.click(button('Cancel'))
    expect(looks().queryByRole('button', { name: /^My look/ })).toBeNull()
  })

  test('Remove this look, and Undo', async () => {
    const { user } = await openAppearance()
    await user.click(button('Violet'))
    await user.click(button('Save as a look…'))
    await user.click(button('Save'))
    await user.click(button('Remove this look'))
    expect(looks().queryByRole('button', { name: /^My look/ })).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(card('My look')).toBeInTheDocument()
  })

  test('the Buy, Hold and Sell colours come from the tested sets', async () => {
    const { user } = await openAppearance()
    const sets = screen.getByRole('combobox', { name: 'Buy, Hold and Sell colours' })
    expect(within(sets).getAllByRole('option').map((o) => o.textContent)).toEqual(['Standard', 'Colour-blind friendly', 'High contrast'])
    await user.selectOptions(sets, 'colourblind')
    expect(token('--up')).toBe('#5AB4FF')
  })

  test('Animations moved here, and a place is kept for the home background', async () => {
    await openAppearance()
    expect(screen.getByRole('combobox', { name: 'Animations' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Home background' })).toBeDisabled()
  })
})

describe('Customize', () => {
  const tab = (name: string) => within(screen.getByRole('group', { name: 'Part of the look' })).getByRole('button', { name })

  test('opens its own page with a sample, and goes back', async () => {
    const { user } = await openAppearance()
    await user.click(button('Customize…'))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Customize')
    expect(screen.getByRole('img', { name: 'Sample of the look' })).toHaveTextContent('AAPL')
    await user.click(button('‹ Appearance'))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Appearance')
  })

  test('a colour that makes text hard to read says so, and “Use the look’s own” undoes it', async () => {
    const { user } = await openAppearance()
    await user.click(button('Customize…'))
    expect(screen.getAllByText(/^Easy to read · \d+\.\d:1$/).length).toBeGreaterThan(2)
    const hex = screen.getByRole('textbox', { name: 'Secondary text as a hex code' })
    await user.clear(hex)
    await user.type(hex, '#20242C')
    expect(token('--muted')).toBe('#20242C')
    expect(screen.getByText('Hard to read.').parentElement).toHaveTextContent(/Hard to read\. Secondary text is 1\.\d:1 against its background\. Aim for 4\.5:1 or more\./)
    await user.click(button('Use the look’s own'))
    expect(token('--muted')).toBe('#92A4B6')
    expect(screen.queryByText('Hard to read.')).toBeNull()
  })

  test('a hex code is taken only once it is a whole colour, and the field shows the colour again on leaving', async () => {
    const { user } = await openAppearance()
    await user.click(button('Customize…'))
    const hex = screen.getByRole('textbox', { name: 'Background as a hex code' })
    await user.clear(hex)
    await user.type(hex, 'red')
    expect(token('--base')).toBe('#070B14')
    await user.tab()
    expect(hex).toHaveValue('#070B14')
  })

  test('the pickers set the background, sidebar, glows and lines', async () => {
    const { user } = await openAppearance()
    await user.click(button('Customize…'))
    fireEvent.change(screen.getByLabelText('Background'), { target: { value: '#101010' } })
    fireEvent.change(screen.getByLabelText('Glow, top left'), { target: { value: '#ff0000' } })
    expect(token('--base')).toBe('#101010')
    expect(token('--g1')).toBe('255 0 0')
    await user.click(within(screen.getByRole('group', { name: 'Lines' })).getByRole('button', { name: 'Strong' }))
    expect(token('--line-a')).toBe('.2')
  })

  test('Text: font, boldness and size', async () => {
    const { user } = await openAppearance()
    await user.click(button('Customize…'))
    await user.click(tab('Text'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Font' }), 'ny')
    expect(token('--ui')).toContain('New York')
    await user.click(within(screen.getByRole('group', { name: 'Boldness' })).getByRole('button', { name: 'Bold' }))
    expect(token('--wt')).toBe('200')
    fireEvent.change(slider('Text size'), { target: { value: '90' } })
    expect(bridge.setLook).toHaveBeenLastCalledWith({ zoom: 0.9, background: '#0A0D14' })
  })

  test('Shape: corners and glass', async () => {
    const { user } = await openAppearance()
    await user.click(button('Customize…'))
    await user.click(tab('Shape'))
    fireEvent.change(slider('Corners'), { target: { value: '0' } })
    expect(token('--round')).toBe('0')
    await user.click(within(screen.getByRole('group', { name: 'Glass' })).getByRole('button', { name: 'Solid' }))
    expect(token('--panel')).toMatch(/^#/)
    expect(token('--frost')).toBe('0')
  })

  test('Chart: the ratings and the three lines', async () => {
    const { user } = await openAppearance()
    await user.click(button('Customize…'))
    await user.click(tab('Chart'))
    expect(screen.getByRole('combobox', { name: 'Buy, Hold and Sell colours' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Company line'), { target: { value: '#ffffff' } })
    expect(token('--c-co')).toBe('#FFFFFF')
    await user.click(button('Use the look’s own'))
    expect(token('--c-co')).toBe('')
  })
})

describe('theme files', () => {
  test('Import… puts the look on, adds it to the looks, and Undo takes it away again', async () => {
    bridge.openTheme.mockResolvedValue({ ok: true, text: themeText({ ...DEFAULT_APPEARANCE, basedOn: 'dusk' }, 'Night shift') })
    const { user } = await openAppearance()
    await user.click(button('Import…'))
    expect(await screen.findByText('Imported “Night shift”')).toBeInTheDocument()
    expect(screen.getByText('It’s with your looks now.')).toBeInTheDocument()
    expect(card('Night shift')).toHaveAttribute('aria-pressed', 'true')
    expect(token('--bg')).toBe('#0E0A16')
    await user.click(button('Undo'))
    expect(looks().queryByRole('button', { name: /^Night shift/ })).toBeNull()
    expect(token('--bg')).toBe('#0A0D14')
  })

  test('a file with odd parts says how many were skipped', async () => {
    bridge.openTheme.mockResolvedValue({ ok: true, text: '{"tearsheet-theme":1,"name":"Odd","script":"alert(1)","glow":20}' })
    const { user } = await openAppearance()
    await user.click(card('Import a theme'))
    expect(await screen.findByText('1 part couldn’t be used and was skipped.')).toBeInTheDocument()
  })

  test('a broken file, or one the Mac can’t open, changes nothing and says why', async () => {
    bridge.openTheme.mockResolvedValueOnce({ ok: true, text: '{"tearsheet-theme": 1, "colours": {' })
    const { user } = await openAppearance()
    await user.click(button('Import…'))
    expect(await screen.findByRole('alert')).toHaveTextContent('That file couldn’t be read as a Tearsheet theme. Nothing changed.')
    expect(token('--bg')).toBe('#0A0D14')

    bridge.openTheme.mockResolvedValueOnce({ ok: false, message: 'That file is too big to be a Tearsheet theme. Nothing changed.' })
    await user.click(button('Import…'))
    expect(await screen.findByRole('alert')).toHaveTextContent('too big')

    bridge.openTheme.mockRejectedValueOnce(new Error('gone'))
    await user.click(button('Import…'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('That file couldn’t be opened. Nothing changed.'))
  })

  test('choosing no file changes nothing and says nothing', async () => {
    const { user } = await openAppearance()
    await user.click(button('Import…'))
    expect(bridge.openTheme).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('Export… saves the look as a theme file through the Mac’s save panel', async () => {
    bridge.saveTheme.mockResolvedValue({ ok: true, file: '/Users/liam/Desktop/My Tearsheet.tearsheet-theme' })
    const { user } = await openAppearance()
    await user.click(button('Amber'))
    await user.click(button('Export…'))
    const [name, text] = bridge.saveTheme.mock.calls[0]
    expect(name).toBe('My Tearsheet')
    expect(JSON.parse(text)).toMatchObject({ 'tearsheet-theme': 1, name: 'My Tearsheet', accent: 'amber' })
    expect(await screen.findByText('Saved as My Tearsheet.tearsheet-theme.')).toBeInTheDocument()

    bridge.saveTheme.mockResolvedValueOnce({ ok: false, message: 'Tearsheet couldn’t save the file there. Try another folder.' })
    await user.click(button('Export…'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try another folder.')
  })

  test('Reset goes back to Tearsheet’s own look, with Undo', async () => {
    const { user } = await openAppearance()
    expect(button('Reset to default')).toBeDisabled()
    await user.click(card('Evergreen'))
    await user.click(button('Reset to default'))
    expect(token('--bg')).toBe('#0A0D14')
    expect(await screen.findByText('Back to Tearsheet’s own look')).toBeInTheDocument()
    await user.click(button('Undo'))
    expect(token('--bg')).toBe('#08110E')
  })
})

describe('the report', () => {
  test('its frame carries the look, and follows a change', async () => {
    const { user } = await renderApp()
    await openReport(user)
    const frame = () => document.querySelector('iframe.report-frame')!.getAttribute('srcdoc') ?? ''
    expect(frame()).toContain('<style id="tearsheet-look">:root{color-scheme:dark;')
    expect(frame()).toContain('--glow:.4')

    menu('settings')
    const nav = await screen.findByRole('navigation', { name: 'Settings topics' })
    await user.click(within(nav).getByRole('button', { name: /^Appearance/ }))
    fireEvent.change(await screen.findByRole('slider', { name: 'Glow' }), { target: { value: '70' } })
    await openReport(user)
    await waitFor(() => expect(frame()).toContain('--glow:.7'))
  })
})
