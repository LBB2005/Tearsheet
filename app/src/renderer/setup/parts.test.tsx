// The copy-a-command line: Copy says Copied, then is a Copy button again.

import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { CodeLine, COPIED_MS } from './parts'

afterEach(() => {
  vi.useRealTimers()
})

test('Copied goes back to Copy after a moment', async () => {
  vi.useFakeTimers()
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } })
  render(<CodeLine text="claude auth login" />)
  await act(async () => screen.getByRole('button', { name: 'Copy: claude auth login' }).click())
  expect(screen.getByRole('button', { name: 'Copied: claude auth login' })).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTime(COPIED_MS))
  expect(screen.getByRole('button', { name: 'Copy: claude auth login' })).toBeInTheDocument()
})
