// What closing the window does. On a Mac, ⌘W and the red button hide it and Tearsheet keeps
// running, as Mac apps do: a report being written carries on, the Dock bounces when it is ready,
// and clicking the Dock icon brings the window back as it was. Quitting (⌘Q, or Quit in the Dock)
// closes it for good. Elsewhere, closing the window quits.

export function closeHides(platform: NodeJS.Platform, quitting: boolean): boolean {
  return platform === 'darwin' && !quitting
}
