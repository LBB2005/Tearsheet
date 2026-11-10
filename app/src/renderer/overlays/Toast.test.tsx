import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ACTION_MS, AFTER_MS, SHOW_MS, Toast } from './Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const show = (action = false) => {
  const onDone = vi.fn()
  render(<Toast notice={{ id: 1, title: 'Deleted MSFT', action: action ? { label: 'Undo', run: vi.fn() } : undefined }} onDone={onDone} />)
  return onDone
}
const later = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('a notice', () => {
  test('leaves on its own after a few seconds', () => {
    const onDone = show()
    later(SHOW_MS - 1)
    expect(onDone).not.toHaveBeenCalled()
    later(1000)
    expect(onDone).toHaveBeenCalled()
  })

  test('with an Undo stays longer', () => {
    const onDone = show(true)
    later(SHOW_MS + 1000)
    expect(onDone).not.toHaveBeenCalled()
    later(ACTION_MS)
    expect(onDone).toHaveBeenCalled()
  })

  test('stays while the pointer rests on it, then a short while more', () => {
    const onDone = show(true)
    const box = screen.getByText('Deleted MSFT').closest('.toast4')!
    later(ACTION_MS - 100)
    fireEvent.mouseEnter(box)
    later(60_000)
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.mouseLeave(box)
    later(AFTER_MS - 1)
    expect(onDone).not.toHaveBeenCalled()
    later(1000)
    expect(onDone).toHaveBeenCalled()
  })

  test('stays while its button has the keyboard, and Esc closes it', () => {
    const onDone = show(true)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.focus(undo)
    later(60_000)
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.keyDown(undo, { key: 'Escape' })
    later(1000)
    expect(onDone).toHaveBeenCalled()
  })
})
