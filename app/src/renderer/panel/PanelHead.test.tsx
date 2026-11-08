import { expect, test } from 'vitest'

import { shownSwitchButton } from './PanelHead'

// The price chart's pane stays mounted, hidden (.away), while a view shows, so its switch is in
// the page too: the focus must go to the pressed button of the switch on show.
test('the switch on show is the one whose pane isn’t hidden away', () => {
  document.body.innerHTML = `
    <section class="cpane away"><div class="pswitch"><button class="on">Price chart</button><button>Score by factor</button></div></section>
    <section class="cpane vpane"><div class="pswitch"><button>Price chart</button><button class="on">Score by factor</button></div></section>`
  expect(shownSwitchButton()?.textContent).toBe('Score by factor')
  document.body.innerHTML = `<section class="cpane"><div class="pswitch"><button class="on">Price chart</button><button>Score by factor</button></div></section>`
  expect(shownSwitchButton()?.textContent).toBe('Price chart')
  document.body.innerHTML = ''
  expect(shownSwitchButton()).toBeNull()
})
