// The key card setup and Settings share (first-run design item 36), on its own with the fake
// bridge: the shape check before any call, the check on paste, only the latest answer counting,
// a rejected key cleared and focused, the masked key, and Try again when Massive can't be reached.

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { CallResult } from '../../preload/api'
import type { KeyChecked } from '../../shared/protocol'
import { bridge, fail, ok } from '../test/bridge'
import { KeyCard } from './KeyCard'

const field = () => screen.getByLabelText('Your Massive key')
const later = () => {
  let answer: (r: CallResult<KeyChecked>) => void = () => undefined
  const promise = new Promise<CallResult<KeyChecked>>((resolve) => (answer = resolve))
  return { promise, answer: (r: CallResult<KeyChecked>) => act(async () => answer(r)) }
}

describe('setup’s key card', () => {
  test('checks a pasted key at once, shows it masked meanwhile, and says when it works', async () => {
    const user = userEvent.setup()
    const onWorks = vi.fn()
    const onOpen = vi.fn()
    render(<KeyCard service="massive" i={0} checkOnPaste getKey={{ onOpen }} placeholder="Then paste it here" onWorks={onWorks} />)
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Get a free key' }))
    expect(onOpen).toHaveBeenCalled()
    expect(bridge.openExternal).toHaveBeenCalledWith('https://massive.com')
    const reply = later()
    bridge.checkKey.mockReturnValueOnce(reply.promise)
    await user.click(field())
    await user.paste('  demo-key-7Hq2  ')
    expect(bridge.checkKey).toHaveBeenCalledWith('massive', 'demo-key-7Hq2')
    expect(screen.getByText('•••• 7Hq2')).toBeInTheDocument()
    expect(field()).toBeDisabled()
    await reply.answer(ok({ proof: 'Works: AAPL closed at $230.10 on Nov 6' }))
    expect(screen.getByText('Works: AAPL closed at $230.10 on Nov 6')).toBeInTheDocument()
    expect(onWorks).toHaveBeenCalledWith('Works: AAPL closed at $230.10 on Nov 6')
    expect(field()).toHaveValue('')
  })

  test('refuses a pasted Terminal line before any call, and clears and focuses the field', async () => {
    const user = userEvent.setup()
    render(<KeyCard service="massive" i={0} checkOnPaste getKey={{}} onWorks={vi.fn()} />)
    await user.click(field())
    await user.paste('you@example.com')
    expect(bridge.checkKey).not.toHaveBeenCalled()
    expect(screen.getByText(/^That looks like a Terminal line, a link or an email/)).toBeInTheDocument()
    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
    // An empty paste does nothing; Return with nothing typed says so.
    await user.paste('')
    await user.keyboard('{Enter}')
    expect(screen.getByText('Paste your key first.')).toBeInTheDocument()
  })

  test('only the latest answer counts', async () => {
    const user = userEvent.setup()
    const onWorks = vi.fn()
    render(<KeyCard service="massive" i={0} checkOnPaste getKey={{}} onWorks={onWorks} />)
    const first = later()
    const second = later()
    bridge.checkKey.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await user.click(field())
    await user.paste('mk-first')
    // The field is busy while the first one checks; a typed Return can't start another…
    await user.keyboard('{Enter}')
    expect(bridge.checkKey).toHaveBeenCalledTimes(1)
    // …but a new paste, once the first is turned down, starts the next.
    await first.answer(fail('timeout', 'SERVICE_UNREACHABLE'))
    expect(screen.getByText('Couldn’t reach Massive just now. Try again in a minute.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(bridge.checkKey).toHaveBeenLastCalledWith('massive', 'mk-first')
    await second.answer(ok({ proof: 'Works' }))
    expect(onWorks).toHaveBeenCalledTimes(1)
  })

  test('a key Massive turns down is cleared and focused, and the engine’s words are never shown', async () => {
    const user = userEvent.setup()
    render(<KeyCard service="massive" i={0} checkOnPaste getKey={{}} onWorks={vi.fn()} />)
    bridge.checkKey.mockResolvedValueOnce(fail('401 for mk-bad', 'KEY_REJECTED'))
    await user.click(field())
    await user.paste('mk-bad')
    expect(await screen.findByText('Massive didn’t accept that key. Check that you copied all of it.')).toBeInTheDocument()
    expect(screen.queryByText(/401/)).toBeNull()
    expect(field()).toHaveValue('')
    await vi.waitFor(() => expect(field()).toHaveFocus())
    bridge.checkKey.mockRejectedValueOnce(new Error('gone'))
    await user.paste('mk-2')
    expect(await screen.findByText('Something went wrong checking the key. Try again.')).toBeInTheDocument()
  })

  test('an answer after the card has gone changes nothing', async () => {
    const user = userEvent.setup()
    const onWorks = vi.fn()
    const view = render(<KeyCard service="massive" i={0} checkOnPaste getKey={{}} onWorks={onWorks} />)
    const reply = later()
    bridge.checkKey.mockReturnValueOnce(reply.promise)
    await user.click(field())
    await user.paste('mk-late')
    view.unmount()
    await reply.answer(ok({ proof: 'Works' }))
    expect(onWorks).not.toHaveBeenCalled()
  })
})

describe('Settings’ key card', () => {
  test('has a Check button and checks on paste too; a paste without checkOnPaste just fills the field', async () => {
    const user = userEvent.setup()
    const view = render(<KeyCard service="fred" i={0} heading={null} checkOnPaste showCheck onWorks={vi.fn()} />)
    await user.click(screen.getByLabelText('Your FRED key'))
    await user.paste('fk-1')
    expect(bridge.checkKey).toHaveBeenCalledWith('fred', 'fk-1')
    expect(await screen.findByText('Works: inflation was 2.9% in September')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your FRED key'), 'fk-2')
    await user.click(screen.getByRole('button', { name: 'Check' }))
    expect(bridge.checkKey).toHaveBeenLastCalledWith('fred', 'fk-2')
    view.unmount()

    render(<KeyCard service="massive" i={0} onWorks={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Paste it here')
    await user.click(field())
    await user.paste('mk-x')
    expect(field()).toHaveValue('mk-x')
    expect(bridge.checkKey).toHaveBeenCalledTimes(2)
  })

  test('a key that already worked shows its proof and a tick', () => {
    render(<KeyCard service="massive" i={0} proof="Works: AAPL" onWorks={vi.fn()} />)
    expect(screen.getByText('Works: AAPL')).toBeInTheDocument()
    expect(document.querySelector('.card')).toHaveClass('done')
  })
})
