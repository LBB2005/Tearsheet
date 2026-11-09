// Build-time switches (first-run design item 2). Only app/src/main/index.ts imports this file; the
// window learns "the button is on" from the main process, so every window test can run both ways.

// The switch for the Install button. Installing Claude Code and signing it in from inside
// Tearsheet waits on Anthropic's approval, so this is the one edit that takes the button out of
// new builds if the answer is no. Turned off, the setup screen shows the paste command in the same
// spot, and the main process doesn't accept install calls at all. It can only turn the button
// off: the online switch below can turn it off too, but neither can turn it on alone.
export const INSTALL_BUTTON = true

// The online off switch's file, for copies already handed out (Stage 2: installSwitch reads it
// once at each launch; nothing reads it yet). It holds `on` or `off`, and only the owner can
// change it.
export const SWITCH_URL = 'https://raw.githubusercontent.com/LBB2005/Tearsheet/main/release/install-button.txt'
