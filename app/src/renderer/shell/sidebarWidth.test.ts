import { describe, expect, test, vi } from 'vitest'

import {
  applySidebarWidth,
  clampWidth,
  dragWidth,
  keyWidth,
  onSidebarWidth,
  setSidebarWidth,
  showSidebarWidth,
  SIDEBAR_BIG_STEP,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_STEP,
  sidebarWidth
} from './sidebarWidth'

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k)
  }
}

const broken = {
  getItem: () => {
    throw new Error('no storage')
  },
  setItem: () => {
    throw new Error('no storage')
  },
  removeItem: () => {
    throw new Error('no storage')
  }
}

function root() {
  const props = new Map<string, string>()
  return { props, style: { setProperty: (name: string, value: string | null) => void props.set(name, value ?? '') } }
}

describe('the limits', () => {
  test('the usual width is today’s, between the narrowest and the widest', () => {
    expect(SIDEBAR_DEFAULT).toBe(232)
    expect(SIDEBAR_MIN).toBeLessThan(SIDEBAR_DEFAULT)
    expect(SIDEBAR_MAX).toBeGreaterThan(SIDEBAR_DEFAULT)
  })

  test('the widest still leaves room for the chart beside a report in the narrowest wide window', async () => {
    const { WIDE_MIN_PX } = await import('./useWide')
    const { CHART_MIN, TEXT_MIN, DIV } = await import('../chart/split')
    expect(WIDE_MIN_PX - SIDEBAR_MAX).toBeGreaterThanOrEqual(CHART_MIN + TEXT_MIN + DIV)
  })

  test('a width is kept inside them, in whole pixels', () => {
    expect(clampWidth(100)).toBe(SIDEBAR_MIN)
    expect(clampWidth(SIDEBAR_MIN - 1)).toBe(SIDEBAR_MIN)
    expect(clampWidth(5000)).toBe(SIDEBAR_MAX)
    expect(clampWidth(SIDEBAR_MAX + 1)).toBe(SIDEBAR_MAX)
    expect(clampWidth(300.4)).toBe(300)
    expect(clampWidth(300.6)).toBe(301)
  })

  test('anything that isn’t a number is the usual width', () => {
    expect(clampWidth(NaN)).toBe(SIDEBAR_DEFAULT)
    expect(clampWidth(Infinity)).toBe(SIDEBAR_DEFAULT)
  })
})

describe('the kept width', () => {
  test('is the usual width when none was kept', () => {
    expect(sidebarWidth(store())).toBe(SIDEBAR_DEFAULT)
    expect(sidebarWidth(null)).toBe(SIDEBAR_DEFAULT)
  })

  test('is read back, inside the limits', () => {
    expect(sidebarWidth(store({ 'sidebar.width': '300' }))).toBe(300)
    expect(sidebarWidth(store({ 'sidebar.width': '9000' }))).toBe(SIDEBAR_MAX)
    expect(sidebarWidth(store({ 'sidebar.width': '12' }))).toBe(SIDEBAR_MIN)
  })

  test('a value that makes no sense, or storage that can’t be read, gives the usual width', () => {
    expect(sidebarWidth(store({ 'sidebar.width': 'wide' }))).toBe(SIDEBAR_DEFAULT)
    expect(sidebarWidth(store({ 'sidebar.width': '' }))).toBe(SIDEBAR_DEFAULT)
    expect(sidebarWidth(broken)).toBe(SIDEBAR_DEFAULT)
  })

  test('setting it keeps it, shows it on the page, and says so', () => {
    const s = store()
    const r = root()
    const heard = vi.fn()
    const stop = onSidebarWidth(heard)
    expect(setSidebarWidth(300, s, r)).toBe(300)
    expect(s.data.get('sidebar.width')).toBe('300')
    expect(r.props.get('--sw')).toBe('300px')
    expect(heard).toHaveBeenCalledWith(300)
    stop()
    setSidebarWidth(320, s, r)
    expect(heard).toHaveBeenCalledTimes(1)
  })

  test('a width outside the limits is kept at the nearest limit', () => {
    const s = store()
    expect(setSidebarWidth(10, s, root())).toBe(SIDEBAR_MIN)
    expect(s.data.get('sidebar.width')).toBe(String(SIDEBAR_MIN))
    expect(setSidebarWidth(9999, s, root())).toBe(SIDEBAR_MAX)
    expect(s.data.get('sidebar.width')).toBe(String(SIDEBAR_MAX))
  })

  test('the usual width is kept as nothing, so a later usual width applies', () => {
    const s = store({ 'sidebar.width': '300' })
    const r = root()
    setSidebarWidth(SIDEBAR_DEFAULT, s, r)
    expect(s.data.has('sidebar.width')).toBe(false)
    expect(r.props.get('--sw')).toBe(`${SIDEBAR_DEFAULT}px`)
  })

  test('storage that can’t be written still shows the width', () => {
    const r = root()
    expect(setSidebarWidth(280, broken, r)).toBe(280)
    expect(r.props.get('--sw')).toBe('280px')
  })

  test('start-up shows the kept width; showing one keeps nothing', () => {
    const s = store({ 'sidebar.width': '290' })
    const r = root()
    applySidebarWidth(s, r)
    expect(r.props.get('--sw')).toBe('290px')
    showSidebarWidth(5000, r)
    expect(r.props.get('--sw')).toBe(`${SIDEBAR_MAX}px`)
    expect(s.data.get('sidebar.width')).toBe('290')
    showSidebarWidth(250, null)
  })
})

describe('the keys', () => {
  test('← and → move the edge a step, and a bigger one with Shift', () => {
    expect(keyWidth('ArrowRight', 232)).toBe(232 + SIDEBAR_STEP)
    expect(keyWidth('ArrowLeft', 300)).toBe(300 - SIDEBAR_STEP)
    expect(keyWidth('ArrowRight', 232, true)).toBe(232 + SIDEBAR_BIG_STEP)
    expect(keyWidth('ArrowLeft', 340, true)).toBe(340 - SIDEBAR_BIG_STEP)
  })

  test('stop at the limits', () => {
    expect(keyWidth('ArrowLeft', SIDEBAR_MIN)).toBe(SIDEBAR_MIN)
    expect(keyWidth('ArrowRight', SIDEBAR_MAX)).toBe(SIDEBAR_MAX)
    expect(keyWidth('ArrowRight', SIDEBAR_MAX - 4, true)).toBe(SIDEBAR_MAX)
  })

  test('Home and End go to the narrowest and the widest, and Return to the usual width', () => {
    expect(keyWidth('Home', 300)).toBe(SIDEBAR_MIN)
    expect(keyWidth('End', 300)).toBe(SIDEBAR_MAX)
    expect(keyWidth('Enter', 300)).toBe(SIDEBAR_DEFAULT)
  })

  test('other keys are left alone', () => {
    expect(keyWidth('ArrowUp', 300)).toBeNull()
    expect(keyWidth('a', 300)).toBeNull()
    expect(keyWidth('Tab', 300)).toBeNull()
  })
})

test('a drag moves the width by as far as the pointer has gone, inside the limits', () => {
  expect(dragWidth(232, 230, 290)).toBe(292)
  expect(dragWidth(300, 300, 250)).toBe(250)
  expect(dragWidth(232, 230, 2000)).toBe(SIDEBAR_MAX)
  expect(dragWidth(232, 230, 0)).toBe(SIDEBAR_MIN)
})
