import { expect, test } from 'vitest'

import { bringBack, claimOnlyCopy, closeHides } from './lifecycle'

test('on a Mac, closing the window hides it until Tearsheet quits', () => {
  expect(closeHides('darwin', false)).toBe(true)
  expect(closeHides('darwin', true)).toBe(false)
})

test('elsewhere, closing the window closes it', () => {
  expect(closeHides('linux', false)).toBe(false)
  expect(closeHides('win32', false)).toBe(false)
})

const fakeWindow = (minimized = false, destroyed = false) => {
  const calls: string[] = []
  return {
    calls,
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore: () => void calls.push('restore'),
    show: () => void calls.push('show'),
    focus: () => void calls.push('focus')
  }
}

const fakeApp = (gotLock: boolean) => {
  const handlers: Record<string, () => void> = {}
  let quit = false
  return {
    handlers,
    quitCalled: () => quit,
    requestSingleInstanceLock: () => gotLock,
    quit: () => {
      quit = true
    },
    on: (event: 'second-instance', listener: () => void) => {
      handlers[event] = listener
    }
  }
}

test('a second copy of Tearsheet on the same data quits at once', () => {
  const app = fakeApp(false)
  expect(claimOnlyCopy(app, () => null)).toBe(false)
  expect(app.quitCalled()).toBe(true)
  expect(app.handlers['second-instance']).toBeUndefined()
})

test('starting Tearsheet again brings the open window back to the front', () => {
  const app = fakeApp(true)
  const win = fakeWindow(true)
  expect(claimOnlyCopy(app, () => win)).toBe(true)
  expect(app.quitCalled()).toBe(false)
  app.handlers['second-instance']()
  expect(win.calls).toEqual(['restore', 'show', 'focus'])
})

test('bringing the window back does nothing before it opens or after it closes', () => {
  expect(() => bringBack(null)).not.toThrow()
  const gone = fakeWindow(false, true)
  bringBack(gone)
  expect(gone.calls).toEqual([])
  const hidden = fakeWindow()
  bringBack(hidden)
  expect(hidden.calls).toEqual(['show', 'focus'])
})
