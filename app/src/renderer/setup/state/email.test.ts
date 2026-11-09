// The SEC email's reducer (first-run design item 30): a suggestion never replaces a typed email.

import { describe, expect, it } from 'vitest'

import { emailFixed, emailReducer, emailStart, emailUsable, type EmailEvent, type EmailMachine } from './email'

const run = (events: EmailEvent[], start: EmailMachine = emailStart()) => events.reduce(emailReducer, start)

describe('the email', () => {
  it('starts empty, takes Claude Code’s as a suggestion, and shows it in full', () => {
    expect(emailStart()).toEqual({ state: 'none', value: '', problem: null })
    const m = run([{ type: 'suggest', email: 'you@example.com' }])
    expect(m).toEqual({ state: 'suggested', value: 'you@example.com', problem: null })
    expect(emailFixed(m)).toBe(true)
    expect(emailUsable(m)).toBe(true)
    expect(run([{ type: 'suggest', email: null }])).toEqual(emailStart())
  })

  it('a newer suggestion replaces an older one, but never a typed, changed or saved email', () => {
    expect(run([{ type: 'suggest', email: 'a@x.com' }, { type: 'suggest', email: 'b@x.com' }]).value).toBe('b@x.com')
    expect(run([{ type: 'type', value: 'me@mine.com' }, { type: 'suggest', email: 'b@x.com' }])).toMatchObject({ state: 'typed', value: 'me@mine.com' })
    expect(run([{ type: 'suggest', email: 'a@x.com' }, { type: 'change' }, { type: 'suggest', email: 'b@x.com' }])).toMatchObject({ state: 'editing', value: 'a@x.com' })
    expect(run([{ type: 'saved', email: 'saved@x.com' }, { type: 'suggest', email: 'b@x.com' }])).toMatchObject({ state: 'saved', value: 'saved@x.com' })
  })

  it('a saved email counts as given, unless one was typed first', () => {
    expect(run([{ type: 'saved', email: 'saved@x.com' }])).toMatchObject({ state: 'saved' })
    expect(run([{ type: 'saved', email: null }])).toEqual(emailStart())
    expect(run([{ type: 'type', value: 'me@x.com' }, { type: 'saved', email: 'saved@x.com' }]).value).toBe('me@x.com')
  })

  it('Change opens the field, and typing there stays a change', () => {
    const m = run([{ type: 'suggest', email: 'a@x.com' }, { type: 'change' }, { type: 'type', value: 'a@y.com' }])
    expect(m).toEqual({ state: 'editing', value: 'a@y.com', problem: null })
    expect(emailFixed(m)).toBe(false)
  })

  it('the engine’s no is shown, Start can’t use it, and typing again clears it', () => {
    let m = run([{ type: 'type', value: 'me@x.com' }, { type: 'refused', problem: 'SEC needs a real contact email.' }])
    expect(m).toEqual({ state: 'invalid', value: 'me@x.com', problem: 'SEC needs a real contact email.' })
    expect(emailUsable(m)).toBe(false)
    m = emailReducer(m, { type: 'type', value: 'me@y.com' })
    expect(m).toEqual({ state: 'typed', value: 'me@y.com', problem: null })
    expect(emailUsable(m)).toBe(true)
  })

  it('isn’t usable until it looks like an email', () => {
    expect(emailUsable(run([{ type: 'type', value: 'me at x' }]))).toBe(false)
    expect(emailFixed(run([{ type: 'saved', email: 'not an email' }]))).toBe(false)
  })
})
