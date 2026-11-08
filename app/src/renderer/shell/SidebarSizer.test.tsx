// The sidebar's right edge, in the whole app: dragging it, double-clicking it and its keys set
// the sidebar's width, which is kept between launches and survives hiding the sidebar. It shows
// only while the sidebar does, in a wide window or opened over the page in a narrow one, and a
// drag on it can never move the window.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fireEvent, screen } from '@testing-library/react'
import postcss from 'postcss'
import { describe, expect, test } from 'vitest'

import { renderApp, sidebarButton, win } from '../test/app'
import { menu } from '../test/bridge'
import { clickReaches, dragAreas, regionOf } from '../test/dragMap'
import { setWindowWidth } from '../test/screen'
import { setSidebarWidth, SIDEBAR_CLOSE_AT, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from './sidebarWidth'

const edge = () => screen.getByRole('separator', { name: 'Resize the sidebar' })
const noEdge = () => screen.queryByRole('separator', { name: 'Resize the sidebar' })
const shownWidth = () => document.documentElement.style.getPropertyValue('--sw')
const kept = () => localStorage.getItem('sidebar.width')
const keptHidden = () => localStorage.getItem('sidebar.hidden')

function drag(from: number, to: number, end: 'up' | 'lost' = 'up') {
  const el = edge()
  fireEvent.pointerDown(el, { clientX: from, button: 0, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: (from + to) / 2, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: to, pointerId: 1 })
  if (end === 'up') fireEvent.pointerUp(el, { pointerId: 1 })
  else {
    el.releasePointerCapture(1)
    fireEvent.lostPointerCapture(el, { pointerId: 1 })
  }
}

describe('the sidebar’s edge', () => {
  test('is a separator the keyboard reaches, at the usual width to begin with', async () => {
    await renderApp()
    expect(edge()).toHaveAttribute('tabindex', '0')
    expect(edge()).toHaveAttribute('aria-orientation', 'vertical')
    expect(edge()).toHaveAttribute('aria-valuemin', String(SIDEBAR_MIN))
    expect(edge()).toHaveAttribute('aria-valuemax', String(SIDEBAR_MAX))
    expect(edge()).toHaveAttribute('aria-valuenow', String(SIDEBAR_DEFAULT))
    expect(edge()).toHaveAttribute('aria-valuetext', 'Sidebar 232 pixels wide, the usual width')
    expect(shownWidth()).toBe('232px')
  })

  test('dragged, the sidebar follows the pointer, and the width is kept once the drag ends', async () => {
    await renderApp()
    fireEvent.pointerDown(edge(), { clientX: 232, button: 0, pointerId: 1 })
    expect(edge()).toHaveClass('on')
    fireEvent.pointerMove(edge(), { clientX: 300, pointerId: 1 })
    expect(shownWidth()).toBe('300px')
    expect(edge()).toHaveAttribute('aria-valuenow', '300')
    expect(edge()).toHaveAttribute('aria-valuetext', 'Sidebar 300 pixels wide')
    // Nothing is kept until the drag ends.
    expect(kept()).toBeNull()
    fireEvent.pointerUp(edge(), { pointerId: 1 })
    expect(edge()).not.toHaveClass('on')
    expect(kept()).toBe('300')
    // The capture lost after the drag ended changes nothing.
    fireEvent.lostPointerCapture(edge(), { pointerId: 1 })
    expect(kept()).toBe('300')
  })

  test('stops at the narrowest and the widest, where the cursor points the one way left', async () => {
    await renderApp()
    drag(232, 900)
    expect(shownWidth()).toBe(`${SIDEBAR_MAX}px`)
    expect(edge()).toHaveClass('max')
    expect(kept()).toBe(String(SIDEBAR_MAX))
    drag(360, SIDEBAR_CLOSE_AT + 30)
    expect(shownWidth()).toBe(`${SIDEBAR_MIN}px`)
    expect(edge()).toHaveClass('min')
    expect(edge()).not.toHaveClass('max')
    expect(kept()).toBe(String(SIDEBAR_MIN))
  })

  test('moves by as far as the pointer goes, wherever on the edge it was grabbed', async () => {
    await renderApp()
    drag(229, 269)
    expect(shownWidth()).toBe('272px')
  })

  test('a drag the window takes away (the pointer lost) still keeps the width it got to', async () => {
    await renderApp()
    drag(232, 280, 'lost')
    expect(edge()).not.toHaveClass('on')
    expect(kept()).toBe('280')
  })

  test('a right click or a pointer that isn’t pressed changes nothing', async () => {
    await renderApp()
    fireEvent.pointerDown(edge(), { clientX: 232, button: 2, pointerId: 1 })
    fireEvent.pointerMove(edge(), { clientX: 320, pointerId: 1 })
    fireEvent.pointerUp(edge(), { pointerId: 1 })
    expect(shownWidth()).toBe('232px')
    expect(edge()).not.toHaveClass('on')
    expect(kept()).toBeNull()
  })

  test('a double-click puts back the usual width', async () => {
    localStorage.setItem('sidebar.width', '320')
    await renderApp()
    expect(shownWidth()).toBe('320px')
    fireEvent.doubleClick(edge())
    expect(shownWidth()).toBe('232px')
    expect(edge()).toHaveAttribute('aria-valuenow', '232')
    expect(kept()).toBeNull()
  })

  test('the keys move it: ← and →, with Shift a bigger step, Home and End, and Return for the usual width', async () => {
    const { user } = await renderApp()
    edge().focus()
    await user.keyboard('{ArrowRight}')
    expect(edge()).toHaveAttribute('aria-valuenow', '248')
    expect(shownWidth()).toBe('248px')
    expect(kept()).toBe('248')
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(edge()).toHaveAttribute('aria-valuenow', '312')
    await user.keyboard('{ArrowLeft}')
    expect(edge()).toHaveAttribute('aria-valuenow', '296')
    await user.keyboard('{End}')
    expect(edge()).toHaveAttribute('aria-valuenow', String(SIDEBAR_MAX))
    await user.keyboard('{Home}')
    expect(edge()).toHaveAttribute('aria-valuenow', String(SIDEBAR_MIN))
    await user.keyboard('{Enter}')
    expect(edge()).toHaveAttribute('aria-valuenow', String(SIDEBAR_DEFAULT))
    expect(kept()).toBeNull()
    // A key the edge doesn't use is left for the rest of the window.
    await user.keyboard('{ArrowUp}')
    expect(edge()).toHaveAttribute('aria-valuenow', String(SIDEBAR_DEFAULT))
  })

  test('the width is kept between launches', async () => {
    localStorage.setItem('sidebar.width', '300')
    const first = await renderApp()
    expect(edge()).toHaveAttribute('aria-valuenow', '300')
    expect(shownWidth()).toBe('300px')
    drag(300, 340)
    first.unmount()
    document.documentElement.style.removeProperty('--sw')

    await renderApp()
    expect(edge()).toHaveAttribute('aria-valuenow', '340')
    expect(shownWidth()).toBe('340px')
  })

  test('a width set elsewhere in the window (a Settings choice) moves the edge at once', async () => {
    await renderApp()
    setSidebarWidth(288)
    expect(await screen.findByRole('separator', { name: 'Resize the sidebar' })).toHaveAttribute('aria-valuenow', '288')
    expect(shownWidth()).toBe('288px')
  })
})

describe('dragged past the narrowest', () => {
  test('a little past it, the sidebar stops at the narrowest and stays open', async () => {
    await renderApp()
    drag(232, SIDEBAR_CLOSE_AT + 10)
    expect(win()).not.toHaveClass('sbhidden')
    expect(shownWidth()).toBe(`${SIDEBAR_MIN}px`)
    expect(kept()).toBe(String(SIDEBAR_MIN))
    expect(keptHidden()).toBeNull()
  })

  test('well past it, the sidebar closes, and its button brings it back at the width it had', async () => {
    localStorage.setItem('sidebar.width', '300')
    const { user } = await renderApp()
    drag(300, SIDEBAR_CLOSE_AT - 20)
    expect(win()).toHaveClass('sbhidden')
    expect(noEdge()).toBeNull()
    expect(keptHidden()).toBe('1')
    // The width from before the drag is kept, not the narrowest.
    expect(kept()).toBe('300')
    expect(shownWidth()).toBe('300px')
    expect(sidebarButton()).toHaveAttribute('aria-expanded', 'false')
    await user.click(sidebarButton())
    expect(win()).not.toHaveClass('sbhidden')
    expect(edge()).toHaveAttribute('aria-valuenow', '300')
    expect(shownWidth()).toBe('300px')
  })

  test('the sidebar slides away while the pointer is still down, and comes back if it goes back', async () => {
    await renderApp()
    const el = edge()
    fireEvent.pointerDown(el, { clientX: 232, button: 0, pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: 60, pointerId: 1 })
    expect(win()).toHaveClass('sbhidden')
    // The edge stays to finish the drag, with nothing kept yet.
    expect(edge()).toHaveClass('on', 'closing', 'min')
    expect(edge()).toHaveAttribute('aria-valuetext', 'Let go to close the sidebar')
    expect(keptHidden()).toBeNull()
    fireEvent.pointerMove(el, { clientX: 280, pointerId: 1 })
    expect(win()).not.toHaveClass('sbhidden')
    expect(edge()).not.toHaveClass('closing')
    expect(shownWidth()).toBe('280px')
    fireEvent.pointerUp(el, { pointerId: 1 })
    expect(win()).not.toHaveClass('sbhidden')
    expect(kept()).toBe('280')
    expect(keptHidden()).toBeNull()
  })

  test('in a narrow window it closes the sidebar opened over the page', async () => {
    setWindowWidth(900)
    const { user } = await renderApp()
    await user.click(sidebarButton())
    expect(win()).toHaveClass('sbover')
    expect(document.querySelector('.sidescrim')).not.toBeNull()
    const el = edge()
    fireEvent.pointerDown(el, { clientX: 232, button: 0, pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: 40, pointerId: 1 })
    expect(win()).not.toHaveClass('sbover')
    expect(document.querySelector('.sidescrim')).toBeNull()
    fireEvent.pointerUp(el, { pointerId: 1 })
    expect(win()).toHaveClass('sbhidden')
    expect(win()).not.toHaveClass('sbover')
    expect(noEdge()).toBeNull()
    // A narrow window's sidebar was only opened over the page; nothing is kept hidden.
    expect(keptHidden()).toBeNull()
    expect(kept()).toBeNull()
  })

  test('⌃⌘S in the middle of a drag that would close it leaves the sidebar working', async () => {
    await renderApp()
    fireEvent.pointerDown(edge(), { clientX: 232, button: 0, pointerId: 1 })
    fireEvent.pointerMove(edge(), { clientX: 40, pointerId: 1 })
    menu('sidebar')
    expect(await screen.findByRole('button', { name: 'Show the sidebar' })).toBeInTheDocument()
    expect(noEdge()).toBeNull()
    menu('sidebar')
    expect(await screen.findByRole('separator', { name: 'Resize the sidebar' })).toBeInTheDocument()
    expect(win()).not.toHaveClass('sbhidden')
  })
})

describe('with the sidebar’s button and narrow windows', () => {
  test('goes while the sidebar is hidden, and the sidebar comes back at the width it had', async () => {
    const { user } = await renderApp()
    drag(232, 310)
    await user.click(sidebarButton())
    expect(win()).toHaveClass('sbhidden')
    expect(noEdge()).toBeNull()
    expect(kept()).toBe('310')
    await user.click(sidebarButton())
    expect(edge()).toHaveAttribute('aria-valuenow', '310')
    expect(shownWidth()).toBe('310px')
  })

  test('a sidebar hidden at launch still opens at the kept width', async () => {
    localStorage.setItem('sidebar.hidden', '1')
    localStorage.setItem('sidebar.width', '300')
    const { user } = await renderApp()
    expect(noEdge()).toBeNull()
    await user.click(sidebarButton())
    expect(shownWidth()).toBe('300px')
  })

  test('in a narrow window it shows only while the sidebar is opened over the page, which takes the kept width', async () => {
    localStorage.setItem('sidebar.width', '300')
    setWindowWidth(900)
    const { user } = await renderApp()
    expect(win()).toHaveClass('narrow', 'sbhidden')
    expect(noEdge()).toBeNull()
    await user.click(sidebarButton())
    expect(win()).toHaveClass('sbover')
    expect(edge()).toHaveAttribute('aria-valuenow', '300')
    drag(300, 260)
    expect(kept()).toBe('260')
    // Dragging the edge leaves the sidebar open over the page.
    expect(win()).toHaveClass('sbover')
  })

  test('isn’t there during setup', async () => {
    await renderApp({ setupDone: false })
    expect(noEdge()).toBeNull()
  })

  test('no area that drags the window lies over it, in every way the sidebar shows, so a drag on it never moves the window', async () => {
    const { user } = await renderApp()
    // The window drags only by the two 52 px strips at the top, which the edge starts below (the
    // next test), and the edge itself is no-drag, after the sidebar's strip in the page.
    const check = () => {
      expect(dragAreas().every((el) => el.matches('.sidedrag, .top'))).toBe(true)
      expect(regionOf(edge())).toBe('no-drag')
      expect(clickReaches(edge(), [document.querySelector('.sidedrag')]).reaches).toBe(true)
    }
    check()
    menu('settings')
    expect(await screen.findByRole('separator', { name: 'Resize the sidebar' })).toBeInTheDocument()
    check()
    setWindowWidth(900)
    await user.click(sidebarButton())
    expect(win()).toHaveClass('sbover')
    check()
  })

  test('it starts below the strips that drag the window, so it never lies over one', () => {
    // A path, not a URL: jsdom's URL class isn't the one Node's file functions take.
    const css = postcss.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8'))
    const decl = (selector: string, prop: string) => {
      let value: string | undefined
      css.walkRules((rule) => {
        if (rule.selector !== selector) return
        rule.walkDecls(prop, (d) => {
          value = d.value
        })
      })
      return value
    }
    const top = decl('.sizer4', 'top')
    expect(top).toBe('52px')
    expect(decl('.sidedrag', 'height')).toBe(top)
    expect(decl('.top', 'height')).toBe(top)
    // And the sidebar doesn't glide behind the pointer while it is dragged.
    // (except as it closes, when it slides away as it does when hidden).
    expect(decl('.win:has(> .sizer4.on:not(.closing)) .side4, .win:has(> .sizer4.on:not(.closing)) .side4 .in', 'transition')).toBe('none')
  })
})
