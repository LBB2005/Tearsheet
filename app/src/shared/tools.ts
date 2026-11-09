// The one picture of an AI tool (first-run design §1, item 1), shared by the main process, the
// preload bridge and the window, and the small helpers both sides use. Nothing here touches Node
// or the DOM, so every side can import it.

export type ToolKind = 'claude' | 'codex'

// What a tool's status read found, as one answer (§1, "One answer per tool"):
//   missing     not found, or its --version didn't answer;
//   too_old     a Claude Code before MIN_CLAUDE_VERSION, whose status command is never run;
//   cant_tell   found, but its status said nothing Tearsheet knows (or it took over a minute);
//   signed_out  found and signed out;
//   api_key     signed in some other way than a plan (an API key, a cloud provider, a token);
//   free_plan   signed in to a free Claude plan;
//   ready       signed in to a plan.
export type ToolState = 'missing' | 'too_old' | 'cant_tell' | 'signed_out' | 'api_key' | 'free_plan' | 'ready'

export interface ToolStatus {
  kind: ToolKind
  name: string
  path: string | null
  // The three fields below are worked out from `state` (toolFlags), so readers that only show
  // words keep working. `reason` says why a tool counts as missing, else null.
  available: boolean
  version: string | null
  loggedIn: boolean | null
  reason: string | null
  state: ToolState
  // The plan label (Claude Code's subscriptionType, like "max"), or null.
  plan: string | null
  // The email Claude Code's status gives, or null. Codex never gives one.
  email: string | null
}

// The version with the last status-command sign-out fix in Claude Code's changelog. An older
// Claude Code counts as too old, and its status command is never run (Goal 3). Codex has none.
export const MIN_CLAUDE_VERSION = '2.1.317'

// `available` and `loggedIn` for each state (item 1's table).
export function toolFlags(state: ToolState): { available: boolean; loggedIn: boolean | null } {
  if (state === 'missing') return { available: false, loggedIn: null }
  if (state === 'too_old' || state === 'cant_tell') return { available: true, loggedIn: null }
  if (state === 'signed_out') return { available: true, loggedIn: false }
  return { available: true, loggedIn: true }
}

// Where the official installers put each tool. Claude Code's install.sh uses ~/.local/bin, and
// Codex's sets BIN_DIR="${CODEX_INSTALL_DIR:-$HOME/.local/bin}" (both read 2026-11-08).
export function installDir(_kind: ToolKind, home: string): string {
  return `${home.replace(/\/+$/, '')}/.local/bin`
}

// The tool setup proposes to write the reports: the first ready one, Claude Code before Codex;
// else the first one that isn't missing, in the same order; else none.
export function pickTool(tools: ToolStatus[]): ToolStatus | null {
  const ordered = (['claude', 'codex'] as const).map((kind) => tools.find((t) => t.kind === kind)).filter((t): t is ToolStatus => Boolean(t))
  return ordered.find((t) => t.state === 'ready') ?? ordered.find((t) => t.state !== 'missing') ?? null
}

// ---------- the commands for the connect card and the paste command (main/toolSteps.ts) ----------

export interface ToolStep {
  tool: ToolKind
  kind: 'install' | 'signIn'
  command: string
}

export interface BlockedStep {
  tool: ToolKind
  reason: string
}

// What tearsheet:commandsFor answers: the steps in order, the ones refused with why, and the paste
// command that joins the steps (null when there is nothing to run).
export interface ToolCommands {
  steps: ToolStep[]
  blocked: BlockedStep[]
  paste: string | null
}

// What tearsheet:copyAndOpenTerminal answers, so the window can say which part failed.
export interface TerminalResult {
  copied: boolean
  opened: boolean
}

// ---------- small helpers ----------

// Whether text looks like an email address: something, @, a name, a dot and more, no spaces.
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// The version number in a tool's --version line: "2.1.317 (Claude Code)" gives "2.1.317".
export function versionNumber(v: string | null): string | null {
  if (v === null) return null
  return /\d+(?:\.\d+)+/.exec(v)?.[0] ?? v.trim()
}

// Whether a --version line is older than `min`, by its dotted numbers. Null when the line holds no
// version number, so the caller can't take it for new enough.
export function versionBelow(v: string | null, min: string): boolean | null {
  const found = v === null ? null : /\d+(?:\.\d+)+/.exec(v)?.[0]
  if (!found) return null
  const a = found.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

// A folder in the home folder, written from ~ as the prototype does.
export function tildePath(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')
}
