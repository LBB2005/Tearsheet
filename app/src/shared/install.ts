// The Install button's words and messages (first-run design item 29), shared by the main process
// (main/installer.ts) and the window. Nothing here touches Node or the DOM.

import type { ToolKind, ToolState, ToolStep } from './tools'

// ---------- the message ----------

export type InstallStatus =
  | 'downloading' // an install step starts
  | 'installing' // its first output line arrives
  | 'installed' // it exits 0, and the fresh read finds the tool
  | 'opening_browser' // a sign-in step starts
  | 'slow' // a sign-in is still running after 15 seconds
  | 'stuck' // a sign-in is still running after 2 minutes
  | 'done' // a sign-in exits 0, and the fresh read says ready
  | 'cancelled' // cancel() stopped a sign-in
  | 'blocked' // stepsFor blocked the step; reason is its reason
  | 'failed' // anything else; reason says why, in a sentence

// install_progress's params.
export interface InstallProgress {
  tool: ToolKind
  step: ToolStep['kind']
  status: InstallStatus
  reason?: string
}

// What run() answers once it has finished. The messages already said how each step went;
// `refused` means nothing ran, and the window shows the paste command instead.
export interface RunResult {
  outcome: 'done' | 'failed' | 'blocked' | 'cancelled' | 'refused'
  why?: 'switch_off' | 'busy'
}

// ---------- the sentences ----------

// The sentence for each state that isn't ready (CUJ 5), in one place so the window can use the
// same words. A sign-in that exits 0 but reads free_plan or api_key fails with its state's.
export const STATE_SENTENCES: Record<ToolKind, Partial<Record<ToolState, string>>> = {
  claude: {
    signed_out: 'Claude Code is signed out.',
    too_old: 'This Claude Code is too old for Tearsheet.',
    free_plan: 'Claude Code needs a paid Claude plan, like Pro or Max.',
    api_key: 'This sign-in uses an API key. Tearsheet runs on your Claude plan.'
  },
  codex: {
    signed_out: 'Codex is signed out.',
    api_key: "This Codex sign-in doesn’t use your ChatGPT plan. Signing in with ChatGPT replaces it for all your Codex use, not only Tearsheet’s."
  }
}

// Why a step failed, as the window shows it (item 29's list, and the few cases it leaves to
// "anything else").
export const FAILURES = {
  download: 'The download failed.',
  signIn: "The sign-in didn’t finish.",
  installTooLong: 'The install took more than 10 minutes, so it was stopped.',
  sameStep: 'Tearsheet stopped, because the same step came up again.',
  anotherCopy: (folder: string) => `Another copy at ${folder} is found first.`,
  notFound: (name: string) => `The install finished, but ${name} wasn’t found.`,
  cantStart: (kind: ToolStep['kind']) => (kind === 'install' ? "Tearsheet couldn’t start the installer." : "Tearsheet couldn’t start the sign-in."),
  cantRead: "Tearsheet couldn’t read the AI tools’ status."
} as const
