// Small helpers for the data keys (first-run design item 32): the services' names, what a failed
// check says, the local shape check that runs before a key is sent, and the masked key shown after
// a paste. Setup's key card and Settings → Data keys share them.

export type KeyService = 'massive' | 'fred'

export const SERVICE_NAME: Record<KeyService, string> = { massive: 'Massive', fred: 'FRED' }

// What a failed key check says. A rejected key and a service that can't be reached get two
// different messages; anything else gets a fixed one. The engine's own text is never shown, so
// the window can't show a key even if an error ever echoed one.
export function keyProblem(service: KeyService, code: string | undefined, _message?: string): string {
  const name = SERVICE_NAME[service]
  if (code === 'KEY_REJECTED') return `${name} didn’t accept that key. Check that you copied all of it.`
  if (code === 'SERVICE_UNREACHABLE') return `Couldn’t reach ${name} just now. Try again in a minute.`
  return 'Something went wrong checking the key. Try again.'
}

// The local check before a key is sent: a pasted Terminal line, a link, a home folder path or an
// email is refused here, so it never reaches the service. Anything else goes to the service's own
// check (Open Questions: what a Massive key looks like). Null when the shape is fine.
export function keyShape(text: string): string | null {
  const key = text.trim()
  if (!key) return 'Paste your key first.'
  if (/\s/.test(key) || /^(curl|http|~)/i.test(key) || key.includes('@')) {
    return 'That looks like a Terminal line, a link or an email, not a key. Copy the key itself, then paste again.'
  }
  return null
}

// A key as the screen shows it after a paste: only its last four characters.
export function maskKey(text: string): string {
  const key = text.trim()
  return key.length > 4 ? `•••• ${key.slice(-4)}` : '••••'
}
