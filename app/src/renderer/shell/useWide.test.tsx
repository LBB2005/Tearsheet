// A resize across 1,100 px changes the layout at once: the change is drawn with transitions off
// (the root's data-snap, styles.css), and they are back on as soon as its style is worked out.

import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { setWindowWidth } from '../test/screen'
import { snap, useWide } from './useWide'

function Probe({ seen }: { seen: boolean[] }) {
  seen.push(useWide())
  return null
}

// A root that says when its size was read, and what data-snap was then.
function fakeRoot() {
  const reads: boolean[] = []
  const root = document.createElement('div')
  Object.defineProperty(root, 'offsetWidth', {
    get: () => {
      reads.push(root.dataset.snap !== undefined)
      return 0
    }
  })
  return { root, reads }
}

describe('useWide', () => {
  test('follows the window across 1,100 px', () => {
    const seen: boolean[] = []
    render(<Probe seen={seen} />)
    expect(seen.at(-1)).toBe(true)
    setWindowWidth(1000)
    expect(seen.at(-1)).toBe(false)
    setWindowWidth(1280)
    expect(seen.at(-1)).toBe(true)
    expect(document.documentElement.dataset.snap).toBeUndefined()
  })

  test('snap makes the change and works its style out with transitions off, then turns them back on', () => {
    const { root, reads } = fakeRoot()
    let during: string | undefined
    snap(() => {
      during = root.dataset.snap
    }, root)
    expect(during).toBe('')
    expect(reads).toEqual([true])
    expect(root.dataset.snap).toBeUndefined()
  })

  test('snap turns transitions back on even if the change throws', () => {
    const { root } = fakeRoot()
    expect(() =>
      snap(() => {
        throw new Error('no')
      }, root)
    ).toThrow('no')
    expect(root.dataset.snap).toBeUndefined()
  })
})
