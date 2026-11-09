// toolWatch.ts with a fake clock and a fake probe: one read at a time, the 5-second timer only
// while the window is in front and waiting, one read each time it comes back, and an event only
// on a change.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toolFlags, type ToolState, type ToolStatus } from '../shared/tools'
import { ToolWatch } from './toolWatch'

const claude = (state: ToolState): ToolStatus => ({
  kind: 'claude',
  name: 'Claude Code',
  path: '/Users/you/.local/bin/claude',
  ...toolFlags(state),
  version: '2.1.317 (Claude Code)',
  reason: null,
  state,
  plan: null,
  email: null
})

let state: ToolState
let probe: ReturnType<typeof vi.fn<() => Promise<ToolStatus[]>>>
let release: (() => void) | null
let hold: boolean

beforeEach(() => {
  vi.useFakeTimers()
  state = 'signed_out'
  hold = false
  release = null
  probe = vi.fn(
    () =>
      new Promise<ToolStatus[]>((resolve) => {
        const answer = () => resolve([claude(state)])
        if (hold) release = answer
        else answer()
      })
  )
})
afterEach(() => vi.useRealTimers())

const watch = () => new ToolWatch({ probe })
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('one read at a time', () => {
  it('a read under way is shared, even when forced', async () => {
    hold = true
    const w = watch()
    const a = w.read()
    const b = w.read(true)
    expect(probe).toHaveBeenCalledTimes(1)
    release!()
    expect(await a).toEqual(await b)
  })

  it('an answer under 5 seconds old is reused, unless forced', async () => {
    const w = watch()
    await w.read()
    await vi.advanceTimersByTimeAsync(4000)
    await w.read()
    expect(probe).toHaveBeenCalledTimes(1)
    await w.read(true)
    expect(probe).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5000)
    await w.read()
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('readAfter starts a new read after one already under way, rather than sharing it', async () => {
    hold = true
    const w = watch()
    const early = w.read(true)
    const late = w.readAfter()
    expect(probe).toHaveBeenCalledTimes(1)
    hold = false
    release!()
    // The person signs in after the early read answered: only a read that starts later sees it.
    state = 'ready'
    expect(await early).toEqual([claude('signed_out')])
    expect(await late).toEqual([claude('ready')])
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('readAfter with nothing under way forces a read, even when the last answer is fresh', async () => {
    const w = watch()
    await w.read()
    await w.readAfter()
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('readAfter still reads when the read under way fails', async () => {
    probe.mockImplementationOnce(() => Promise.reject(new Error('boom')))
    const w = watch()
    const early = w.read(true)
    const late = w.readAfter()
    await expect(early).rejects.toThrow('boom')
    expect(await late).toEqual([claude('signed_out')])
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('has no current answer before its first read', () => {
    expect(watch().current).toBeNull()
  })

  it('a read that fails lets the next one start', async () => {
    probe.mockRejectedValueOnce(new Error('boom'))
    const w = watch()
    await expect(w.read()).rejects.toThrow('boom')
    await expect(w.read()).resolves.toEqual([claude('signed_out')])
  })
})

describe('when it reads by itself', () => {
  it('every 5 seconds while the window is in front and waiting', async () => {
    const w = watch()
    w.setWaiting(true)
    w.onWindowFocus()
    await flush()
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(probe).toHaveBeenCalledTimes(4)
    w.setWaiting(false)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(probe).toHaveBeenCalledTimes(4)
    w.stop()
  })

  it('never on the timer while the window is in the background', async () => {
    const w = watch()
    w.setWaiting(true)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(probe).not.toHaveBeenCalled()
    w.onWindowFocus()
    await flush()
    w.onWindowBlur()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('once each time the window comes to the front, waiting or not', async () => {
    const w = watch()
    for (let i = 0; i < 3; i++) {
      w.onWindowFocus()
      await flush()
      w.onWindowBlur()
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(probe).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(probe).toHaveBeenCalledTimes(3)
  })
})

describe('the tools_changed push', () => {
  it('is sent for the first answer and then only on a change', async () => {
    const w = watch()
    const changed = vi.fn()
    w.on('changed', changed)
    await w.read(true)
    await w.read(true)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenLastCalledWith([claude('signed_out')])
    // The person signs in.
    state = 'ready'
    await w.read(true)
    expect(changed).toHaveBeenCalledTimes(2)
    expect(changed).toHaveBeenLastCalledWith([claude('ready')])
    expect(w.current).toEqual([claude('ready')])
  })
})
