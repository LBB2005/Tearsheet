// The clicks that broke before, each tested two ways: the click does what it should (the sidebar
// hides, the chart opens, the switch swaps the frames), and a real click would reach the control
// at all. The second is the one that failed: the toolbar and the sidebar's top strip drag the
// window, and a control that isn't a no-drag area after them in the page loses every real click
// to a window move (test/dragMap.ts). A test's own clicks skip the drag areas, so only that check
// would have caught the three bugs:
//   - the Chart button and the Numbers / Text switch: `all: unset` reset their no-drag
//     (fixed by the toolbar's no-drag rule being !important);
//   - the sidebar button: it came before the two strips in the page (fixed by App putting it last).

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { openReport, renderApp, sidebarButton, win } from '../test/app'
import { bridge, menu } from '../test/bridge'
import { clickReaches, describe as name, dragAreas, regionOf, unreachable } from '../test/dragMap'
import { setWindowWidth, sizeReportPage } from '../test/screen'

// The two strips the sidebar button sits on: the sidebar's top strip and the toolbar.
const strips = () => [document.querySelector('.sidedrag'), document.querySelector('.top')]
const reachesSidebarButton = () => clickReaches(sidebarButton(), strips())
const chartButton = () => screen.getByRole('button', { name: /^Chart/ })
const switchButton = (side: 'Numbers' | 'Text') => within(screen.getByRole('group', { name: 'Beside the chart' })).getByRole('button', { name: side })
const shownFrame = () => document.querySelector('iframe.report-frame.on')?.getAttribute('title')

describe('the sidebar button', () => {
  test('hides and shows the sidebar in a wide window, and remembers it', async () => {
    const { user } = await renderApp()
    expect(win()).not.toHaveClass('sbhidden')
    expect(sidebarButton()).toHaveAttribute('aria-expanded', 'true')

    await user.click(sidebarButton())
    expect(win()).toHaveClass('sbhidden')
    expect(sidebarButton()).toHaveAccessibleName('Show the sidebar')
    expect(localStorage.getItem('sidebar.hidden')).toBe('1')

    await user.click(sidebarButton())
    expect(win()).not.toHaveClass('sbhidden')
    expect(sidebarButton()).toHaveAccessibleName('Hide the sidebar')
  })

  test('opens the sidebar over the page in a narrow window; the button, the scrim and Esc close it', async () => {
    setWindowWidth(900)
    const { user } = await renderApp()
    expect(win()).toHaveClass('narrow', 'sbhidden')

    await user.click(sidebarButton())
    expect(win()).toHaveClass('sbover')
    await user.click(sidebarButton())
    expect(win()).not.toHaveClass('sbover')

    await user.click(sidebarButton())
    fireEvent.mouseDown(document.querySelector('.sidescrim')!)
    expect(win()).not.toHaveClass('sbover')

    await user.click(sidebarButton())
    await user.keyboard('{Escape}')
    expect(win()).not.toHaveClass('sbover')
  })

  test('the sidebar opened over the page closes once another page opens', async () => {
    setWindowWidth(900)
    const { user } = await renderApp()
    await user.click(sidebarButton())
    await user.click(screen.getByRole('button', { name: /Settings/ }))
    expect(win()).toHaveClass('on-settings')
    expect(win()).not.toHaveClass('sbover')
  })

  test('a real click reaches it on every page, with the sidebar open or closed, wide or narrow', async () => {
    const { user } = await renderApp()
    const pages: [string, () => Promise<void>][] = [
      ['home', async () => menu('new')],
      ['report', async () => openReport(user)],
      ['log', async () => user.click(screen.getByRole('button', { name: /Prediction log/ }))],
      ['settings', async () => menu('settings')]
    ]
    const seen: string[] = []
    for (const [page, open] of pages) {
      for (const width of [1280, 900]) {
        setWindowWidth(width)
        if (win().classList.contains('sbover')) await user.click(sidebarButton())
        if (width >= 1100 && win().classList.contains('sbhidden')) await user.click(sidebarButton())
        await open()
        expect(win()).toHaveClass(`on-${page}`)
        // Both ways the sidebar can sit at this width.
        for (let i = 0; i < 2; i++) {
          const reach = reachesSidebarButton()
          seen.push(`${page} ${width} ${win().className}: ${reach.reaches ? 'reaches' : `lost to ${reach.by && name(reach.by)}`}`)
          await user.click(sidebarButton())
        }
      }
    }
    expect(seen.filter((s) => !s.endsWith('reaches'))).toEqual([])
    expect(seen).toHaveLength(16)
  })

  test('it comes after both drag strips in the page, as the later area wins', async () => {
    await renderApp()
    for (const strip of strips()) {
      expect(strip).not.toBeNull()
      expect(regionOf(strip!)).toBe('drag')
      expect(strip!.compareDocumentPosition(sidebarButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})

describe('the Chart button', () => {
  test('opens the chart beside the report, and closes it', async () => {
    const { user } = await renderApp()
    sizeReportPage()
    await openReport(user)
    expect(chartButton()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Price chart' })).toBeNull()

    await user.click(chartButton())
    expect(chartButton()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Price chart' })).toBeInTheDocument()
    expect(bridge.getChart).toHaveBeenCalledWith('r-aapl-2')
    expect(await screen.findByRole('img', { name: /AAPL daily price/ })).toBeInTheDocument()

    await user.click(chartButton())
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Price chart' })).toBeNull())
    expect(chartButton()).toHaveAttribute('aria-pressed', 'false')
  })

  test('⌘3 does the same, and the panel’s own close button closes it', async () => {
    const { user } = await renderApp()
    sizeReportPage()
    await openReport(user)
    menu('chart')
    expect(screen.getByRole('region', { name: 'Price chart' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close the panel' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Price chart' })).toBeNull())
  })

  test('a real click reaches it, with the chart open or closed', async () => {
    const { user } = await renderApp()
    sizeReportPage()
    await openReport(user)
    expect(clickReaches(chartButton())).toEqual({ reaches: true, by: chartButton() })
    await user.click(chartButton())
    expect(clickReaches(chartButton()).reaches).toBe(true)
  })
})

describe('the Numbers / Text switch', () => {
  test('shows only while the chart leaves the report one column', async () => {
    const { user } = await renderApp()
    sizeReportPage()
    await openReport(user)
    expect(screen.queryByRole('group', { name: 'Beside the chart' })).toBeNull()
    await user.click(chartButton())
    expect(screen.getByRole('group', { name: 'Beside the chart' })).toBeInTheDocument()
    // Full width hides the report, and the switch with it.
    await user.click(screen.getByRole('button', { name: 'Full' }))
    expect(screen.queryByRole('group', { name: 'Beside the chart' })).toBeNull()
  })

  test('puts the numbers beside the chart, then the text again, without reloading either', async () => {
    const { user } = await renderApp()
    sizeReportPage()
    await openReport(user)
    await user.click(chartButton())
    expect(switchButton('Text')).toHaveAttribute('aria-pressed', 'true')
    expect(shownFrame()).toBe('Report')

    await user.click(switchButton('Numbers'))
    expect(switchButton('Numbers')).toHaveAttribute('aria-pressed', 'true')
    expect(bridge.getReport).toHaveBeenLastCalledWith('r-aapl-2', expect.objectContaining({ side: 'numbers', motion: false }))
    const numbers = await screen.findByTitle('Report, numbers')
    fireEvent.load(numbers)
    expect(shownFrame()).toBe('Report, numbers')

    const asked = bridge.getReport.mock.calls.length
    await user.click(switchButton('Text'))
    expect(shownFrame()).toBe('Report')
    await user.click(switchButton('Numbers'))
    expect(shownFrame()).toBe('Report, numbers')
    expect(bridge.getReport).toHaveBeenCalledTimes(asked)
  })

  test('a real click reaches both halves', async () => {
    const { user } = await renderApp()
    sizeReportPage()
    await openReport(user)
    await user.click(chartButton())
    expect(clickReaches(switchButton('Numbers')).reaches).toBe(true)
    expect(clickReaches(switchButton('Text')).reaches).toBe(true)
  })
})

describe('the window’s drag areas', () => {
  test('every control in the toolbar takes a real click, on every page and in every state', async () => {
    const { user } = await renderApp()
    const lost: string[] = []
    const check = (where: string) => lost.push(...unreachable().map((c) => `${where}: ${c}`))

    check('home')
    sizeReportPage()
    await openReport(user)
    check('report')
    await user.click(await screen.findByRole('button', { name: 'Nov 5' }))
    expect(screen.getByRole('menu', { name: 'Other reports' })).toBeInTheDocument()
    check('report, other reports menu')
    await user.keyboard('{Escape}')
    menu('find')
    check('report, find')
    await user.click(chartButton())
    check('report, chart open')
    await user.click(screen.getByRole('button', { name: 'Full' }))
    check('report, chart full')
    setWindowWidth(900)
    check('report, narrow')
    setWindowWidth(1280)
    menu('settings')
    check('settings')
    await user.click(screen.getByRole('button', { name: /Prediction log/ }))
    check('log')
    menu('lookup')
    check('look-up box')
    expect(lost).toEqual([])
  })

  test('the report’s top bar takes the pointer on each part, so pointing at one says what it means', async () => {
    const { user } = await renderApp()
    await openReport(user)
    const parts = Array.from(document.querySelectorAll('.top .rbar > .rbar-line > *'))
    expect(parts.length).toBeGreaterThan(2)
    expect(parts.filter((p) => !clickReaches(p).reaches).map(name)).toEqual([])
  })

  test('only the toolbar and the sidebar’s top strip drag the window, so no other strip can cover a control', async () => {
    const { user } = await renderApp()
    await openReport(user)
    await user.click(chartButton())
    const areas = dragAreas().map((el) => (el.matches('.top') ? '.top' : el.matches('.sidedrag') ? '.sidedrag' : name(el)))
    expect(new Set(areas)).toEqual(new Set(['.top', '.sidedrag']))
  })
})
