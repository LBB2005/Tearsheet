import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { keepAwakeDuringLine, lineWantsAwake } from './awake'

const lineNote = (params: Record<string, unknown>) => ({ method: 'line_changed', params: { waiting: [], writing: null, finished: [], paused: null, typical: null, ...params } })

describe('lineWantsAwake', () => {
  it('wants the Mac awake while the line has a report being written or waiting', () => {
    expect(lineWantsAwake(lineNote({ writing: { ticker: 'JPM' } }))).toBe(true)
    expect(lineWantsAwake(lineNote({ waiting: [{ ticker: 'O' }] }))).toBe(true)
    expect(lineWantsAwake(lineNote({}))).toBe(false)
    expect(lineWantsAwake(lineNote({ waiting: [{ ticker: 'O' }], paused: { code: 'USAGE_LIMIT' } }))).toBe(false)
    // Waiting for the plan's usage to reset, the Mac stays awake so the line can carry on.
    expect(lineWantsAwake(lineNote({ waiting: [{ ticker: 'O' }], paused: { code: 'USAGE_LIMIT', wait_until: '2026-11-08T15:42:00Z' } }))).toBe(true)
    expect(lineWantsAwake(lineNote({ waiting: [{ ticker: 'O' }], paused: { code: 'USAGE_HIGH', wait_until: '2026-11-08T15:42:00Z' } }))).toBe(true)
    // Asking Liam (the weekly 80%), or a real problem, lets the Mac sleep.
    expect(lineWantsAwake(lineNote({ waiting: [{ ticker: 'O' }], paused: { code: 'USAGE_WEEK', wait_until: null } }))).toBe(false)
    expect(lineWantsAwake(lineNote({ paused: { code: 'USAGE_HIGH', wait_until: '2026-11-08T15:42:00Z' } }))).toBe(false)
    expect(lineWantsAwake({ method: 'engine_restarted', params: {} })).toBe(false)
    expect(lineWantsAwake({ method: 'progress', params: {} })).toBeNull()
  })
})

describe('keepAwakeDuringLine', () => {
  it('holds the Mac awake once while the line goes, and lets go when it ends or the engine restarts', () => {
    const engine = new EventEmitter()
    const blocker = { start: vi.fn(() => 7), stop: vi.fn() }
    keepAwakeDuringLine(engine, blocker)
    engine.emit('notification', lineNote({ writing: { ticker: 'JPM' }, waiting: [{ ticker: 'O' }] }))
    engine.emit('notification', lineNote({ writing: { ticker: 'O' } }))
    engine.emit('notification', { method: 'progress', params: {} })
    expect(blocker.start).toHaveBeenCalledTimes(1)
    expect(blocker.start).toHaveBeenCalledWith('prevent-app-suspension')
    engine.emit('notification', lineNote({ finished: [{ ticker: 'JPM' }, { ticker: 'O' }] }))
    expect(blocker.stop).toHaveBeenCalledWith(7)
    engine.emit('notification', lineNote({}))
    expect(blocker.stop).toHaveBeenCalledTimes(1)

    engine.emit('notification', lineNote({ waiting: [{ ticker: 'XOM' }] }))
    expect(blocker.start).toHaveBeenCalledTimes(2)
    engine.emit('crashed')
    expect(blocker.stop).toHaveBeenCalledTimes(2)
  })
})
