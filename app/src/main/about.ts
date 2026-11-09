// Settings → About and help, and Help → Send Feedback (docs/launch/launch-readiness.md, M7-M9).
// The version numbers a person can quote, and the feedback email: it opens in their own Mail app
// with those numbers filled in, and nothing is sent until they send it. Tearsheet itself sends
// nothing to its author.

export interface AboutInfo {
  app: string
  engine: string | null
  macos: string
  electron: string
}

// Where feedback goes. Liam picks the public address before the first public release; until then
// the email opens with the To line empty, for the person to fill in.
export const FEEDBACK_EMAIL = ''

export const FEEDBACK_SUBJECT = 'Tearsheet feedback'

// The versions, one per line, as the feedback email and the About page show them.
export function versionLines(info: AboutInfo): string[] {
  return [`Tearsheet ${info.app}`, `Engine ${info.engine ?? 'not running'}`, `macOS ${info.macos}`, `Electron ${info.electron}`]
}

// The mailto: address of the feedback email. Only the versions go in it; the person writes the
// rest. Spaces are %20, not +, because Mail shows a + as it is.
export function feedbackMailto(info: AboutInfo, to: string = FEEDBACK_EMAIL): string {
  const body = ['What happened, or what would you change?', '', '', '', '---', ...versionLines(info)].join('\n')
  const query = `subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(body)}`
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${query}`
}
