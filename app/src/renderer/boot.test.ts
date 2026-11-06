import { describe, expect, it } from 'vitest'

import { bootView, GIVE_UP_AFTER_MS, STARTING_AFTER_MS } from './boot'

const waiting = { waitedMs: 0, answered: false, error: null, fatal: null }

describe('bootView', () => {
  it('shows empty glass for the first second, then “Starting Tearsheet…”', () => {
    expect(bootView(waiting)).toEqual({ kind: 'blank' })
    expect(bootView({ ...waiting, waitedMs: STARTING_AFTER_MS - 1 })).toEqual({ kind: 'blank' })
    expect(bootView({ ...waiting, waitedMs: STARTING_AFTER_MS })).toEqual({ kind: 'starting' })
    expect(bootView({ ...waiting, waitedMs: GIVE_UP_AFTER_MS - 1 })).toEqual({ kind: 'starting' })
  })

  it('says the engine didn’t start when nothing answers in time', () => {
    const view = bootView({ ...waiting, waitedMs: GIVE_UP_AFTER_MS })
    expect(view.kind).toBe('failed')
    expect(view.kind === 'failed' && view.message).toBe('Tearsheet’s engine didn’t answer within 20 seconds.')
  })

  it('shows the engine’s own reason when it fails, or the settings can’t be read', () => {
    expect(bootView({ ...waiting, fatal: 'The engine couldn’t start: spawn uv ENOENT' })).toEqual({ kind: 'failed', message: 'The engine couldn’t start: spawn uv ENOENT' })
    expect(bootView({ ...waiting, waitedMs: 300, error: 'The engine stopped.' })).toEqual({ kind: 'failed', message: 'The engine stopped.' })
  })

  it('opens once the settings answer, even after it gave up waiting', () => {
    expect(bootView({ ...waiting, answered: true })).toEqual({ kind: 'ready' })
    expect(bootView({ ...waiting, answered: true, waitedMs: GIVE_UP_AFTER_MS + 5000 })).toEqual({ kind: 'ready' })
  })

  it('puts a failure before an answer', () => {
    expect(bootView({ ...waiting, answered: true, fatal: 'The app and engine versions don’t match.' })).toEqual({ kind: 'failed', message: 'The app and engine versions don’t match.' })
  })
})
