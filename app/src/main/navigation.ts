// What a click inside the report frame does (design item 42). A plain function from an
// address to an action, so it can be tested on its own. The main process applies it to every
// navigation inside the frame and cancels the navigation itself. The links are
// tearsheet://flag/<claim ID>, tearsheet://reread/<accession> and
// tearsheet://open/<view>[/<item>], which asks the app to show a chart or table bigger, and
// tearsheet://download/<pdf|pptx|xlsx>/<report id>, which saves the report as a file (downloads.ts).

export const VIEWS = ['price', 'factors', 'metrics', 'methods', 'returns', 'flags', 'economy', 'rings', 'analysts'] as const
export type ViewKind = (typeof VIEWS)[number]
export type ViewId = ViewKind | `table-${string}`

export type NavigationAction =
  | { kind: 'flag'; claimId: string }
  | { kind: 'reread'; accession: string }
  | { kind: 'open'; view: ViewId; item: string | null }
  | { kind: 'download'; format: 'pdf' | 'pptx' | 'xlsx'; reportId: string }
  | { kind: 'external'; url: string }
  | { kind: 'blocked'; url: string }

const CLAIM_ID = /^[A-Za-z0-9:._-]+$/
const ACCESSION = /^[0-9]{10}-[0-9]{2}-[0-9]{6}$/
const TABLE_VIEW = /^table-[a-z_]{1,32}$/
const ITEM = /^[A-Za-z0-9_.-]{1,64}$/
const FORMATS = ['pdf', 'pptx', 'xlsx'] as const
// A saved report's id, as the engine writes it into the link (render.py _REPORT_ID).
const REPORT_ID = /^[A-Za-z0-9._-]{1,80}$/

// The view and the optional item of tearsheet://open/<view>[/<item>]. Each part is decoded on
// its own, so an encoded slash can't turn one part into two.
function openAction(url: URL): NavigationAction | null {
  if (url.search !== '' || url.hash !== '') return null
  const parts = url.pathname.replace(/^\//, '').split('/')
  if (parts.length > 2) return null
  let view: string
  let item: string | null = null
  try {
    view = decodeURIComponent(parts[0])
    if (parts.length === 2) item = decodeURIComponent(parts[1])
  } catch {
    return null
  }
  if (!(VIEWS as readonly string[]).includes(view) && !TABLE_VIEW.test(view)) return null
  if (item !== null && !ITEM.test(item)) return null
  return { kind: 'open', view: view as ViewId, item }
}

// The format and the report of tearsheet://download/<format>/<report id>, each part decoded on
// its own and checked, as for open.
function downloadAction(url: URL): NavigationAction | null {
  if (url.search !== '' || url.hash !== '') return null
  const parts = url.pathname.replace(/^\//, '').split('/')
  if (parts.length !== 2) return null
  let format: string
  let reportId: string
  try {
    format = decodeURIComponent(parts[0])
    reportId = decodeURIComponent(parts[1])
  } catch {
    return null
  }
  if (!(FORMATS as readonly string[]).includes(format) || !REPORT_ID.test(reportId)) return null
  return { kind: 'download', format: format as (typeof FORMATS)[number], reportId }
}

export function navigationAction(address: string): NavigationAction {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return { kind: 'blocked', url: address }
  }
  if (url.protocol === 'tearsheet:') {
    const what = url.hostname
    if (what === 'open') return openAction(url) ?? { kind: 'blocked', url: address }
    if (what === 'download') return downloadAction(url) ?? { kind: 'blocked', url: address }
    const value = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (what === 'flag' && CLAIM_ID.test(value)) return { kind: 'flag', claimId: value }
    if (what === 'reread' && ACCESSION.test(value)) return { kind: 'reread', accession: value }
    return { kind: 'blocked', url: address }
  }
  if (url.protocol === 'https:') return { kind: 'external', url: url.toString() }
  return { kind: 'blocked', url: address }
}
