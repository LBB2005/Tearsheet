// The only outside pages the window may ask to open, in the user's browser.

const HOSTS = new Set(['massive.com', 'www.massive.com', 'fred.stlouisfed.org', 'fredaccount.stlouisfed.org', 'nodejs.org', 'claude.ai'])

export function isAllowedExternal(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.port === '' && parsed.username === '' && parsed.password === '' && HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}
