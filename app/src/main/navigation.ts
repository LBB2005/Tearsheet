// What a click inside the report frame does (design item 42). A plain function from an
// address to an action, so it can be tested on its own. The main process applies it to every
// navigation inside the frame and cancels the navigation itself.

export type NavigationAction =
  | { kind: 'flag'; claimId: string }
  | { kind: 'reread'; accession: string }
  | { kind: 'external'; url: string }
  | { kind: 'blocked'; url: string }

const CLAIM_ID = /^[A-Za-z0-9:._-]+$/
const ACCESSION = /^[0-9]{10}-[0-9]{2}-[0-9]{6}$/

export function navigationAction(address: string): NavigationAction {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return { kind: 'blocked', url: address }
  }
  if (url.protocol === 'tearsheet:') {
    // tearsheet://flag/<claim ID> and tearsheet://reread/<accession>
    const what = url.hostname
    const value = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (what === 'flag' && CLAIM_ID.test(value)) return { kind: 'flag', claimId: value }
    if (what === 'reread' && ACCESSION.test(value)) return { kind: 'reread', accession: value }
    return { kind: 'blocked', url: address }
  }
  if (url.protocol === 'https:') return { kind: 'external', url: url.toString() }
  return { kind: 'blocked', url: address }
}
