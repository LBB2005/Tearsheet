// What closing the window does. On a Mac, ⌘W and the red button hide it and Tearsheet keeps
// running, as Mac apps do: a report being written carries on, the Dock bounces when it is ready,
// and clicking the Dock icon brings the window back as it was. Quitting (⌘Q, or Quit in the Dock)
// closes it for good. Elsewhere, closing the window quits.

export function closeHides(platform: NodeJS.Platform, quitting: boolean): boolean {
  return platform === 'darwin' && !quitting
}

// For checks only: TEARSHEET_HIDDEN_WINDOW=1 opens Tearsheet with its window never shown, so a
// check can drive it (over the debugger, on a copy of the data) while Liam works in other apps.
// Nothing then shows the window or brings Tearsheet to the front: not starting up, not the menu,
// not a second copy. Nothing in the app sets it.
export function hiddenForChecks(env: NodeJS.ProcessEnv): boolean {
  return env.TEARSHEET_HIDDEN_WINDOW === '1'
}

// One Tearsheet at a time for a data folder. A second copy would run a second engine on the same
// reports, so starting Tearsheet again quits the new copy and brings the open window back to the
// front instead. The lock is Electron's, kept in the window's own folder under the data folder,
// so a copy run on other data (TEARSHEET_DATA_DIR) is a different Tearsheet and opens as usual.
export interface Instance {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', listener: () => void): unknown
}

export interface Shown {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function claimOnlyCopy(app: Instance, window: () => Shown | null): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }
  app.on('second-instance', () => bringBack(window()))
  return true
}

// The window as it was, in front: un-minimised, shown if ⌘W hid it, and focused.
export function bringBack(win: Shown | null): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
