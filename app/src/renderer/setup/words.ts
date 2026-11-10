// The setup screen's words (first-run design item 32), kept here once: each tool's names, the
// sentence for each state that isn't ready (CUJ 5), the Install button's progress words (§2), the
// buttons that fix a state, and the sentence that says where data goes (Goal 6). Settings, the
// home page and the run view use the same words. The commands themselves live in the main
// process (main/toolSteps.ts); the window only ever names the tools.

import { FAILURES, STATE_SENTENCES, type InstallProgress } from '../../shared/install'
import type { ToolKind, ToolState, ToolStatus } from '../../shared/tools'

// ---------- words that depend on the tool ----------

export interface ToolText {
  name: string
  short: string
  plan: string
  maker: string
  // Where its installer and sign-in page are.
  site: string
  needs: string
}

export const TOOL_TEXT: Record<ToolKind, ToolText> = {
  claude: {
    name: 'Claude Code',
    short: 'Claude',
    plan: 'Claude plan',
    maker: 'Anthropic',
    site: 'claude.ai',
    needs: 'a paid Claude plan, like Pro or Max'
  },
  codex: {
    name: 'Codex',
    short: 'Codex',
    plan: 'ChatGPT plan',
    maker: 'OpenAI',
    site: 'chatgpt.com',
    needs: 'a paid ChatGPT plan, like Plus or Pro'
  }
}

export const checkText = (template: string, t: ToolText) => template.replace('{t}', t.short).replace('{p}', t.plan)

// The plan a ready tool is signed in to, as the AI row says it: "Claude Max", or the plan's name
// when Tearsheet doesn't know the code. Codex's status doesn't say which ChatGPT plan.
export function planLabel(tool: Pick<ToolStatus, 'kind' | 'plan'>): string {
  if (tool.kind === 'codex') return 'ChatGPT plan'
  const plan = tool.plan?.trim().toLowerCase()
  if (!plan) return 'Claude plan'
  return `Claude ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`
}

// Who a ready tool is signed in as: "Signed in as you@x.com, Claude Max" (CUJ 1).
export function signedInAs(tool: ToolStatus): string {
  if (tool.kind === 'codex') return 'Signed in with ChatGPT'
  return tool.email ? `Signed in as ${tool.email}, ${planLabel(tool)}` : `Signed in, ${planLabel(tool)}`
}

// ---------- each state that isn't ready (CUJ 5) ----------

// The sentence the AI row and the connect card say for a tool's state.
export function stateSentence(kind: ToolKind, state: ToolState): string {
  const T = TOOL_TEXT[kind]
  const shared = STATE_SENTENCES[kind][state]
  if (shared) return shared
  if (state === 'missing') return 'Not set up yet'
  if (state === 'cant_tell') return `Checking your ${T.short} sign-in…`
  if (state === 'free_plan') return `${T.name} needs ${T.needs}.`
  if (state === 'too_old') return `This ${T.name} is too old for Tearsheet.`
  if (state === 'api_key') return `This ${T.name} sign-in doesn’t use your ${T.plan}.`
  if (state === 'signed_out') return `${T.name} is signed out.`
  return `${T.name} is connected.`
}

// The one button that fixes a state (CUJ 5's table), or null when there is none.
export function fixLabel(kind: ToolKind, state: ToolState): string | null {
  const T = TOOL_TEXT[kind]
  if (state === 'signed_out') return `Sign in to ${T.name}`
  if (state === 'too_old') return `Update ${T.name}`
  if (state === 'free_plan') return 'Sign in again'
  if (state === 'api_key') return kind === 'claude' ? 'Sign in with your Claude account' : 'Sign in with ChatGPT'
  return null
}

// ---------- the Install button's progress (§2) ----------

// One install_progress message as the window says it: downloading, installing, installed,
// opening your browser; then the waiting, and how it ended.
export function progressWords(p: InstallProgress): string {
  const T = TOOL_TEXT[p.tool]
  switch (p.status) {
    case 'downloading':
      return `Downloading the ${T.name} installer from ${T.site}`
    case 'installing':
      return `Installing ${T.name}`
    case 'installed':
      return `${T.name} is installed`
    case 'opening_browser':
      return `Opening your browser to sign in to ${T.short}`
    case 'slow':
    case 'stuck':
      return `Waiting for you to sign in to ${T.short}, in your browser`
    case 'done':
      return `Signed in to ${T.name}`
    case 'cancelled':
      return `Signing in to ${T.name} was stopped`
    default:
      return p.reason ?? (p.step === 'install' ? FAILURES.download : FAILURES.signIn)
  }
}

export const WORDS = {
  connectStep: 'Step 1 of 3',
  connectTitle: 'Connect the AI that writes your reports',
  connectLead: 'Neither Claude Code nor Codex is on this Mac yet. Pick the plan you pay for.',
  // Says whose installer runs and where it comes from (security audit, 9 Nov 2026): the Install
  // button runs each maker's own install script (toolSteps.ts, INSTALL_COMMANDS).
  connectFine: 'Tearsheet runs the official installer from Anthropic (claude.ai) or OpenAI (chatgpt.com), then your browser opens so you can sign in. About a minute. With both, Claude Code writes your reports and Codex checks each draft.',
  pasteFine: 'In Terminal, press',
  pasteFineAfter: 'and sign in when your browser opens.',
  commandsHead: 'These are the commands Tearsheet runs',
  installClaude: 'Install Claude Code',
  installCodex: 'Install Codex',
  installBoth: 'Install both',
  hasClaude: 'I have a Claude plan',
  hasCodex: 'I have a ChatGPT plan',
  hasBoth: 'I have both plans',
  copyOpen: 'Copy and open Terminal',
  copyAgain: 'Copy and open Terminal again',
  copyFailed: 'The copy didn’t work. Copy this line yourself, paste it in Terminal and press Return.',
  copiedNoTerminal: 'The command is copied, but Terminal didn’t open. Open Terminal, paste it and press Return.',
  showCommand: 'Show the command again',
  hideCommand: 'Hide the command',
  stopSignIn: 'Stop signing in',
  openSignIn: 'Browser didn’t open? Open the sign-in page',
  stuck: 'Still waiting? Sign in from Terminal instead, where you can paste a code.',
  tryAgain: 'Try again',
  showLog: 'Show log',
  keyStep: 'Step 2 of 3',
  keyTitle: 'Get a free price key',
  keyLead: 'Massive gives you one in about a minute. The prices in your reports come from it.',
  keyRowMissing: 'A free key from Massive',
  keyRowWorks: 'Massive key works',
  keyRowSaved: 'Massive key saved',
  otherKey: 'Use another key',
  finishStep: 'Step 3 of 3',
  finishReady: 'You’re ready',
  finishEmail: 'Last thing: your email',
  emailLead: 'SEC asks every program that downloads filings for a contact email. It gets this one with each download, and no one else does.',
  emailLabel: 'Your email for SEC',
  change: 'Change',
  start: 'Start Tearsheet',
  waitKey: 'Waiting for your Massive key',
  addEmail: 'Add your email',
  readyNow: 'Ready when you are',
  saveFailed: 'Tearsheet couldn’t save your setup. Try again.',
  refused: 'The Install button is off in this copy now. Paste the command in Terminal instead.'
} as const

// The connect card's progress heading.
export const installTitle = (kinds: ToolKind[]) => `Installing ${kinds.map((k) => TOOL_TEXT[k].name).join(' and ')}`

// The AI row while a sign-in waits in the browser.
export const signingWords = (kinds: ToolKind[]) =>
  kinds.length > 1 ? `Waiting for you to sign in to ${kinds.map((k) => (k === 'claude' ? 'Claude' : 'ChatGPT')).join(', then ')}, in your browser.` : 'Waiting for you to sign in, in your browser.'

// Why Start can't be pressed yet.
export const waitTool = (kind: ToolKind) => `Waiting for ${TOOL_TEXT[kind].name} to sign in`

// The email row before an email is in.
// The SEC email row before an email is in: where it will come from. With no AI tool on the Mac
// yet, neither is known.
export const emailHint = (from: 'claude' | 'codex' | 'none') =>
  from === 'claude' ? 'Fills in from your Claude sign-in' : from === 'codex' ? 'Codex doesn’t share one, so you type it' : 'From your Claude sign-in, or you type it'

// ---------- where data goes (Goal 6) ----------

export interface DataInput {
  writer: ToolKind
  // The checking tool, when it is connected too.
  checker: ToolKind | null
  // The tools whose installer ran from the Install button.
  installed: ToolKind[]
  // The news_articles setting: on, the news sites on the allowlist are read.
  news: boolean
}

// The data sentence on the finish card: Anthropic or OpenAI for the AI text; SEC for the email and
// filing downloads; Massive for the key and prices; iShares for the S&P 500 list; GitHub for the
// off switch's file; claude.ai or chatgpt.com for the install scripts, when Install was pressed;
// and the news sites only when the news setting is on. The outside-services list
// (tearsheet.md section 12).
export function dataSentence({ writer, checker, installed, news }: DataInput): string {
  const W = TOOL_TEXT[writer]
  const parts = [`${W.name} writes each report on your ${W.plan}, so ${W.maker} gets the text it reads and writes.`]
  if (checker) {
    const C = TOOL_TEXT[checker]
    parts.push(`${C.name} checks each draft on your ${C.plan}, so ${C.maker} sees the drafts too.`)
  }
  if (writer === 'codex' || checker === 'codex') parts.push('Codex also sends your own ~/.codex/AGENTS.md file to OpenAI with each call.')
  parts.push('SEC gets your email with each filing download. Massive and FRED get your keys and the price and economy requests. GitHub gives Tearsheet one small file at each launch, with nothing about you.')
  if (news) parts.push('The news sites on the allowlist get a request for each article a report reads.')
  const sites = (['claude', 'codex'] as const).filter((k) => installed.includes(k)).map((k) => TOOL_TEXT[k].site)
  if (sites.length) parts.push(`The install ${sites.length > 1 ? 'scripts' : 'script'} came from ${sites.join(' and ')}.`)
  return parts.join(' ')
}
