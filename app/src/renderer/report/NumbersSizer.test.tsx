// The line between the report's numbers column and its text, on the report page: dragging it,
// its keys and a double-click set the numbers column's width, which is kept for every report and
// between launches. It shows only while the report shows both columns, and the frames are given
// the width as it moves, with no reload.

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { openReport, renderApp, win } from '../test/app'
import { sizeReportPage } from '../test/screen'
import { NUMBERS_DEFAULT, NUMBERS_MIN, TEXT_MIN } from './numbersWidth'

const line = () => screen.getByRole('separator', { name: 'Resize the numbers column' })
const noLine = () => screen.queryByRole('separator', { name: 'Resize the numbers column' })
const box = () => document.querySelector('.rframe') as HTMLElement
const shown = () => box().style.getPropertyValue('--nums-w')
const kept = () => localStorage.getItem('report.numbersWidth')
const frame = () => document.querySelector('iframe.report-frame') as HTMLIFrameElement
const now = () => Number(line().getAttribute('aria-valuenow'))

async function openWide(width = 1048) {
  const app = await renderApp()
  sizeReportPage(width)
  await openReport(app.user)
  return app
}

// Drags the line from x to x + by, and lets go.
async function drag(by: number, end: 'up' | 'lost' = 'up') {
  const el = line()
  fireEvent.pointerDown(el, { clientX: 500, button: 0, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: 500 + by / 2, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: 500 + by, pointerId: 1 })
  if (end === 'up') fireEvent.pointerUp(el, { pointerId: 1 })
  else {
    el.releasePointerCapture(1)
    fireEvent.lostPointerCapture(el, { pointerId: 1 })
  }
}

describe('the line between the numbers and the text', () => {
  test('is a separator the keyboard reaches, at the usual width to begin with', async () => {
    await openWide()
    expect(line()).toHaveAttribute('tabindex', '0')
    expect(line()).toHaveAttribute('aria-orientation', 'vertical')
    expect(line()).toHaveAttribute('aria-valuemin', String(NUMBERS_MIN))
    expect(line()).toHaveAttribute('aria-valuemax', String(1048 - TEXT_MIN))
    expect(line()).toHaveAttribute('aria-valuetext', 'Numbers column 548 pixels wide, the usual width')
    expect(now()).toBe(NUMBERS_DEFAULT)
    expect(shown()).toBe('548px')
    // The frame runs the page's one script, and starts at the width kept.
    expect(frame()).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame().getAttribute('srcdoc')).toContain(':root{--nums-w:548px}')
  })

  test('dragged, the column follows the pointer, a frame at a time, and the width is kept once the drag ends', async () => {
    await openWide()
    const post = vi.spyOn(frame().contentWindow as Window, 'postMessage')
    const el = line()
    fireEvent.pointerDown(el, { clientX: 500, button: 0, pointerId: 1 })
    expect(el).toHaveClass('on')
    fireEvent.pointerMove(el, { clientX: 600, pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: 652, pointerId: 1 })
    // Nothing is kept, and no render happens, while it moves.
    expect(kept()).toBeNull()
    await waitFor(() => expect(shown()).toBe('700px'))
    expect(post).toHaveBeenLastCalledWith({ tearsheetNumbersWidth: 700 }, '*')
    expect(el).toHaveAttribute('aria-valuenow', '700')
    fireEvent.pointerUp(el, { pointerId: 1 })
    expect(el).not.toHaveClass('on')
    expect(kept()).toBe('700')
    expect(now()).toBe(700)
    expect(line()).toHaveAttribute('aria-valuetext', 'Numbers column 700 pixels wide')
  })

  test('stops at the least either column keeps, and its cursor says which way it can still go', async () => {
    await openWide()
    await drag(2000)
    expect(now()).toBe(1048 - TEXT_MIN)
    expect(kept()).toBe(String(1048 - TEXT_MIN))
    expect(line()).toHaveClass('max')
    await drag(-2000, 'lost')
    expect(now()).toBe(NUMBERS_MIN)
    expect(line()).toHaveClass('min')
  })

  test('a click with no move keeps nothing, and a double-click puts back the usual width', async () => {
    await openWide()
    await drag(100)
    expect(kept()).toBe('648')
    await drag(0)
    expect(kept()).toBe('648')
    fireEvent.doubleClick(line())
    expect(kept()).toBeNull()
    expect(now()).toBe(NUMBERS_DEFAULT)
    expect(shown()).toBe('548px')
  })

  test('the arrows step it (Shift, further), Home and End go to the ends, Return to the usual width', async () => {
    await openWide()
    fireEvent.keyDown(line(), { key: 'ArrowRight' })
    expect(now()).toBe(564)
    fireEvent.keyDown(line(), { key: 'ArrowLeft', shiftKey: true })
    expect(now()).toBe(500)
    fireEvent.keyDown(line(), { key: 'End' })
    expect(now()).toBe(1048 - TEXT_MIN)
    fireEvent.keyDown(line(), { key: 'Home' })
    expect(now()).toBe(NUMBERS_MIN)
    expect(kept()).toBe(String(NUMBERS_MIN))
    fireEvent.keyDown(line(), { key: 'Enter' })
    expect(now()).toBe(NUMBERS_DEFAULT)
    expect(kept()).toBeNull()
    fireEvent.keyDown(line(), { key: 'x' })
    expect(now()).toBe(NUMBERS_DEFAULT)
  })

  test('is kept for the next report, which starts at it, and given again to a frame as it loads', async () => {
    const { user } = await openWide()
    fireEvent.keyDown(line(), { key: 'End' })
    await openReport(user, 'MSFT')
    expect(now()).toBe(1048 - TEXT_MIN)
    const last = [...document.querySelectorAll('iframe.report-frame')].at(-1) as HTMLIFrameElement
    expect(last.getAttribute('srcdoc')).toContain(`:root{--nums-w:${1048 - TEXT_MIN}px}`)
    const post = vi.spyOn(last.contentWindow as Window, 'postMessage')
    fireEvent.load(last)
    expect(post).toHaveBeenCalledWith({ tearsheetNumbersWidth: 1048 - TEXT_MIN }, '*')
  })

  test('a window narrower than it was keeps the width kept, and shows what fits', async () => {
    await openWide(1400)
    fireEvent.keyDown(line(), { key: 'End' })
    expect(kept()).toBe(String(1400 - TEXT_MIN))
    sizeReportPage(1000)
    expect(now()).toBe(1000 - TEXT_MIN)
    // The page and the line work the edge out from the width kept, by CSS.
    expect(shown()).toBe(`${1400 - TEXT_MIN}px`)
    expect(kept()).toBe(String(1400 - TEXT_MIN))
    sizeReportPage(1400)
    expect(now()).toBe(1400 - TEXT_MIN)
  })

  test('isn’t there in one column, or with the chart beside a narrow report', async () => {
    const { user } = await openWide(800)
    expect(noLine()).toBeNull()
    sizeReportPage(1048)
    expect(line()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Chart/ }))
    expect(noLine()).toBeNull()
  })

  test('never lies over an area that drags the window, and while dragged no frame takes the pointer', async () => {
    await openWide()
    expect(line().closest('.top')).toBeNull()
    fireEvent.pointerDown(line(), { clientX: 500, button: 0, pointerId: 1 })
    expect(win().querySelector('.nsizer.on')).not.toBeNull()
    fireEvent.pointerUp(line(), { pointerId: 1 })
    expect(win().querySelector('.nsizer.on')).toBeNull()
  })
})
