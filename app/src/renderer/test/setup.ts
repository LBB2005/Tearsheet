// Runs before every test file. The logic tests run in Node and need none of it; the screen tests
// (.test.tsx, in jsdom) get a pretend screen, a fresh fake bridge and empty storage before each
// test, and the screen is taken down after it.

// The DOM matchers (toHaveClass, toBeInTheDocument…) for expect.
import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach } from 'vitest'

if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  const { installScreen, resetScreen } = await import('./screen')
  const { installBridge } = await import('./bridge')
  installScreen()
  beforeEach(() => {
    resetScreen()
    localStorage.clear()
    document.documentElement.removeAttribute('data-motion')
    installBridge()
  })
  afterEach(() => cleanup())
}
