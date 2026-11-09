// A pretend screen for the screen tests. jsdom lays nothing out, so every size is 0 and there is
// no matchMedia or ResizeObserver. Here the window has a width (wide by default, so the sidebar
// sits beside the page), Reduce motion is on (so nothing waits on an animation), and elements
// matching a selector can be given a size, which getBoundingClientRect, clientWidth and
// clientHeight then report.

import { act } from '@testing-library/react'

interface Size {
  width: number
  height: number
}

const state = {
  width: 1280,
  reducedMotion: true,
  dark: true,
  sizes: [] as [string, Size][]
}

type Listener = (e: { matches: boolean; media: string }) => void
const medias = new Set<{ query: string; listeners: Set<Listener>; last: boolean }>()
const observers = new Set<FakeResizeObserver>()

function evaluate(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query)
  if (min) return state.width >= Number(min[1])
  const max = /\(max-width:\s*(\d+)px\)/.exec(query)
  if (max) return state.width <= Number(max[1])
  if (/prefers-reduced-motion:\s*reduce/.test(query)) return state.reducedMotion
  if (/prefers-color-scheme:\s*dark/.test(query)) return state.dark
  return false
}

function matchMedia(query: string): MediaQueryList {
  const entry = { query, listeners: new Set<Listener>(), last: evaluate(query) }
  medias.add(entry)
  const list = {
    media: query,
    get matches() {
      return evaluate(query)
    },
    onchange: null,
    addEventListener: (_type: string, fn: Listener) => entry.listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => entry.listeners.delete(fn),
    addListener: (fn: Listener) => entry.listeners.add(fn),
    removeListener: (fn: Listener) => entry.listeners.delete(fn),
    dispatchEvent: () => true
  }
  return list as unknown as MediaQueryList
}

class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {
    observers.add(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observers.delete(this)
  }
  fire() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function sizeOf(el: Element): Size {
  for (let i = state.sizes.length - 1; i >= 0; i--) {
    const [selector, size] = state.sizes[i]
    if (el.matches(selector)) return size
  }
  return { width: 0, height: 0 }
}

// Called once, from setup.ts.
export function installScreen(): void {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia })
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: matchMedia })
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: FakeResizeObserver })
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: FakeResizeObserver })
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const { width, height } = sizeOf(this)
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect
  }
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: function (this: Element) { return sizeOf(this).width } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: function (this: Element) { return sizeOf(this).height } })
  // The chart's dividers capture the pointer while they are dragged.
  const captured = new WeakMap<Element, Set<number>>()
  Element.prototype.setPointerCapture = function (this: Element, id: number) {
    captured.set(this, (captured.get(this) ?? new Set()).add(id))
  }
  Element.prototype.releasePointerCapture = function (this: Element, id: number) {
    captured.get(this)?.delete(id)
  }
  Element.prototype.hasPointerCapture = function (this: Element, id: number) {
    return captured.get(this)?.has(id) ?? false
  }
  Element.prototype.scrollIntoView = () => undefined
  if (!('PointerEvent' in window)) {
    class PointerEvent extends MouseEvent {
      readonly pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEvent })
  }
}

// Before each test: a wide window, Reduce motion on, the Mac in dark mode, nothing sized.
export function resetScreen(): void {
  state.width = 1280
  state.reducedMotion = true
  state.dark = true
  state.sizes = []
  medias.clear()
}

// Reduce motion on the Mac, on by default so nothing waits on an animation.
export function setReducedMotion(on: boolean): void {
  state.reducedMotion = on
}

// The Mac switches between light and dark: the media queries that change say so.
export function setSystemDark(dark: boolean): void {
  state.dark = dark
  act(() => {
    for (const m of medias) {
      const now = evaluate(m.query)
      if (now === m.last) continue
      m.last = now
      for (const fn of m.listeners) fn({ matches: now, media: m.query })
    }
  })
}

// Resize the window: the media queries that change say so, and every ResizeObserver fires.
export function setWindowWidth(width: number): void {
  state.width = width
  act(() => {
    for (const m of medias) {
      const now = evaluate(m.query)
      if (now === m.last) continue
      m.last = now
      for (const fn of m.listeners) fn({ matches: now, media: m.query })
    }
    for (const o of observers) o.fire()
  })
}

// Give the elements matching `selector` a size. A later call wins over an earlier one.
export function setSize(selector: string, width: number, height = 0): void {
  state.sizes.push([selector, { width, height }])
  act(() => {
    for (const o of observers) o.fire()
  })
}

// The window as it is when a report is open beside the sidebar: the report page and the chart
// have room to lay out.
export function sizeReportPage(width = 1048): void {
  setSize('.rpage', width, 760)
  setSize('.chartwrap', 520, 420)
}
