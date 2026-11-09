// The only outside pages Tearsheet opens in the user's browser: the pages the window may ask for,
// and, separately, the tool makers' sign-in pages, which only the installer opens (first-run
// design item 14).

const HOSTS = new Set(['massive.com', 'www.massive.com', 'fred.stlouisfed.org', 'fredaccount.stlouisfed.org', 'claude.ai'])

// The hosts a sign-in link may open on, used only by the installer's openSignInPage. Checked
// against the tools on 2026-11-08: Claude Code 2.1.317 signs in to a plan at
// claude.com/cai/oauth/authorize (claude.ai on older copies), and Codex 0.165.0 at
// auth.openai.com. platform.claude.com is the Console's API-key sign-in, so it isn't on the list.
export const SIGN_IN_HOSTS: readonly string[] = ['claude.ai', 'claude.com', 'auth.openai.com']

// https on one of `hosts`, with no port, user or password.
function onHost(url: string, hosts: { has(host: string): boolean }): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.port === '' && parsed.username === '' && parsed.password === '' && hosts.has(parsed.hostname)
  } catch {
    return false
  }
}

// The pages the window may ask to open (tearsheet:openExternal).
export function isAllowedExternal(url: string): boolean {
  return onHost(url, HOSTS)
}

// A sign-in page the installer may open. The window never sends these links.
export function isSignInLink(url: string, hosts: readonly string[] = SIGN_IN_HOSTS): boolean {
  return onHost(url, new Set(hosts))
}
