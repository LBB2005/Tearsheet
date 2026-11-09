import { expect, test } from 'vitest'

import { INSTALL_BUTTON, SWITCH_URL } from './flags'

// A build that turns the button off is one edit here; this pins today's value so the edit is seen.
test('the Install button is on in this build, and the online off switch is the public repository’s file', () => {
  expect(INSTALL_BUTTON).toBe(true)
  expect(SWITCH_URL).toBe('https://raw.githubusercontent.com/LBB2005/Tearsheet/main/release/install-button.txt')
})
