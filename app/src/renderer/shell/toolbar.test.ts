import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// The toolbar drags the window (-webkit-app-region: drag), and a click on a control in it has to
// reach the control. A control styled with `all: unset` resets its no-drag too wherever its rule
// outranks `.top button`, as the Chart button's and the Numbers / Text switch's did: macOS then
// took every click on them as the start of a window move, and nothing happened. So the toolbar's
// no-drag rule is !important, which `all: unset` can't undo.
test('every control in the toolbar stays out of the window drag, even with all: unset', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  const rule = css.match(/\.top button,[^{]*\{([^}]*)\}/)
  expect(rule?.[1]).toMatch(/-webkit-app-region:\s*no-drag\s*!important/)
})
