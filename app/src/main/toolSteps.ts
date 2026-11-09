// The one list of install and sign-in steps (first-run design §2, item 6). Every rule lives here
// once: the official installers, CODEX_NON_INTERACTIVE=1, "too old means install again" (only for
// a copy in the official folder), "Codex's sign-in never on a Codex that reads ready", and "never
// the real installers when a test switch or a program path is set". The Install button (Stage 2)
// runs the list one step at a time and re-plans after each; the paste command (pasteCommand.ts)
// joins it into one command. The window only ever says which tools to set up, never what to run.

import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { installDir, type BlockedStep, type ToolKind, type ToolStatus, type ToolStep } from '../shared/tools'
import { noRealInstallers, testMode, TOOLS } from './tools'

export interface StepRules {
  // Any of the four test variables is set (tools.ts): no real installer is ever given.
  noRealInstallers: boolean
  // The test folder (TEARSHEET_TEST_TOOLS), whose stand-in installers are given instead.
  testTools?: string
  // The program paths set for this launch (TEARSHEET_CLAUDE_BIN, TEARSHEET_CODEX_BIN).
  programPaths?: Partial<Record<ToolKind, string>>
  // The home folder, for installDir.
  home?: string
}

const setValue = (value: string | undefined): string | undefined => (value && value.trim() ? value.trim() : undefined)

// The rules for this launch, from the environment, worked out once (index.ts).
export function stepRules(env: NodeJS.ProcessEnv, home: string = homedir()): StepRules {
  return {
    noRealInstallers: noRealInstallers(env),
    testTools: testMode(env) ? setValue(env.TEARSHEET_TEST_TOOLS) : undefined,
    programPaths: { claude: setValue(env.TEARSHEET_CLAUDE_BIN), codex: setValue(env.TEARSHEET_CODEX_BIN) },
    home
  }
}

// The official installers. Checked against the installer, 2026-11-08.
export const INSTALL_COMMANDS: Record<ToolKind, string> = {
  claude: 'curl -fsSL https://claude.ai/install.sh | bash',
  // CODEX_NON_INTERACTIVE=1, so Codex's installer asks no questions.
  codex: 'curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh'
}

// The sign-ins, after the tool's own path. Checked against the installer, 2026-11-08.
export const SIGN_IN_ARGS: Record<ToolKind, string> = {
  claude: 'auth login',
  codex: 'login'
}

const SPEC = Object.fromEntries(TOOLS.map((t) => [t.kind, t])) as Record<ToolKind, (typeof TOOLS)[number]>

// A path as one shell word: left bare when it is plainly safe, else single-quoted.
export function shellWord(s: string): string {
  return /^[A-Za-z0-9_./+-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
}

const withTilde = (path: string, home: string) => {
  const base = home.replace(/\/+$/, '')
  return base && (path === base || path.startsWith(`${base}/`)) ? `~${path.slice(base.length)}` : path
}

// Whether running the installer again updates this copy: it is in the official folder, or it is
// the test path a stand-in installer writes.
function installedHere(kind: ToolKind, path: string | null, rules: StepRules, home: string): boolean {
  if (!path) return false
  if (dirname(path) === installDir(kind, home)) return true
  return Boolean(rules.testTools && path === rules.programPaths?.[kind])
}

function installCommand(kind: ToolKind, rules: StepRules): string | null {
  // The stand-in installers (scripts/test-tools/install-<kind>.sh, copied into the test folder).
  if (rules.testTools) return shellWord(join(rules.testTools, `install-${kind}.sh`))
  if (rules.noRealInstallers) return null
  return INSTALL_COMMANDS[kind]
}

function refusal(kind: ToolKind, rules: StepRules): string {
  const spec = SPEC[kind]
  if (rules.programPaths?.[kind]) return `A program path is set for ${spec.name} (${spec.overrideEnv}), so Tearsheet won't install another copy.`
  return "Test settings are on, so Tearsheet won't run the real installer."
}

// The steps for `kinds`, in order: every install first, then every sign-in, Claude Code before
// Codex. By state: missing, the installer then the sign-in; too_old in the official folder, the
// same; too_old anywhere else, blocked; signed_out, api_key and free_plan, the sign-in; ready and
// cant_tell, nothing. A sign-in uses the path the status gives; after an install in the same
// list it uses the set test path, else the official folder.
export function stepsFor(kinds: ToolKind[], tools: ToolStatus[], rules: StepRules): { steps: ToolStep[]; blocked: BlockedStep[] } {
  const home = rules.home ?? homedir()
  const installs: ToolStep[] = []
  const signIns: ToolStep[] = []
  const blocked: BlockedStep[] = []
  for (const kind of (['claude', 'codex'] as const).filter((k) => kinds.includes(k))) {
    const spec = SPEC[kind]
    const tool = tools.find((t) => t.kind === kind)
    const state = tool?.state ?? 'missing'
    if (state === 'ready' || state === 'cant_tell') continue
    let install = state === 'missing'
    if (state === 'too_old') {
      if (!installedHere(kind, tool?.path ?? null, rules, home)) {
        const folder = withTilde(dirname(tool?.path ?? ''), home)
        blocked.push({ tool: kind, reason: `This ${spec.name} was installed another way (${folder}). Update it the way you installed it.` })
        continue
      }
      install = true
    }
    let signInPath = tool?.path ?? join(installDir(kind, home), spec.binary)
    if (install) {
      const command = installCommand(kind, rules)
      if (!command) {
        blocked.push({ tool: kind, reason: refusal(kind, rules) })
        continue
      }
      installs.push({ tool: kind, kind: 'install', command })
      signInPath = rules.programPaths?.[kind] ?? join(installDir(kind, home), spec.binary)
    }
    signIns.push({ tool: kind, kind: 'signIn', command: `${shellWord(signInPath)} ${SIGN_IN_ARGS[kind]}` })
  }
  return { steps: [...installs, ...signIns], blocked }
}
