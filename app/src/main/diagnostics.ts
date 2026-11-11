// Settings → About and help → Copy diagnostics (docs/launch/launch-readiness.md, S2): the version
// numbers, the AI tools, and the last lines of engine.log, copied for the person to paste into a
// feedback email. Nothing is sent anywhere. Before it reaches the clipboard, the text loses every
// email address, key and token, and the person's home folder.

import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

import type { ToolStatus } from '../shared/tools'
import { versionLines, type AboutInfo } from './about'

// How many lines of engine.log are copied, and the most of its end that is read to find them.
export const LOG_LINES = 200
const TAIL_BYTES = 256 * 1024

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// A secret by its name: `apiKey=…`, `api_key=…`, `ANTHROPIC_API_KEY=…`, `token=…`, `password=…`.
const NAMED = /\b([A-Za-z_]*(?:api[_-]?key|token|secret|password|passwd))=([^&\s"',;]+)/gi
// The same in JSON: `"token": "…"`.
const NAMED_JSON = /("[A-Za-z_]*(?:api[_-]?key|token|secret|password|passwd)")(\s*:\s*)"[^"]*"/gi
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/g
// Anthropic and OpenAI keys and tokens: sk-ant-…, sk-proj-…, sk-….
const SK = /\bsk-[A-Za-z0-9_-]{8,}/g
// A secret by its shape: 32 or more letters and digits in a row with a digit among them, like a
// Massive or FRED key. Dates, run ids and version numbers are far shorter.
const BARE = /(?<![A-Za-z0-9])(?=[A-Za-z]*[0-9])[A-Za-z0-9]{32,}(?![A-Za-z0-9])/g
const OTHER_HOME = /\/Users\/[^/\s"':]+/g

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The text with emails, keys, tokens and the home folder taken out.
export function scrub(text: string, home: string): string {
  let out = text.replace(EMAIL, '[email]')
  out = out.replace(NAMED_JSON, '$1$2"[secret]"')
  out = out.replace(NAMED, '$1=[secret]')
  out = out.replace(BEARER, '$1 [secret]')
  out = out.replace(SK, '[secret]')
  out = out.replace(BARE, '[secret]')
  // The home folder becomes ~, and any other account's name in a /Users path goes too.
  if (home && home !== '/') out = out.replace(new RegExp(`${escapeRegExp(home)}(?=[/\\s"':]|$)`, 'gm'), '~')
  return out.replace(OTHER_HOME, '/Users/[name]')
}

// One AI tool: its name, version and state, never its email, plan or path.
export function toolLine(tool: ToolStatus): string {
  return `${tool.name} ${tool.version ?? 'not found'} (${tool.state})`
}

// The last LOG_LINES lines of a log file, read from its end only, or null when there is none.
export function readLogTail(file: string, lines = LOG_LINES): string | null {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    return null
  }
  try {
    const size = fstatSync(fd).size
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    const all = buffer.toString('utf8').split('\n')
    // A read that starts mid-file starts mid-line: that first piece is dropped.
    if (length < size) all.shift()
    while (all.length && all[all.length - 1] === '') all.pop()
    return all.slice(-lines).join('\n')
  } catch {
    return null
  } finally {
    closeSync(fd)
  }
}

export interface DiagnosticsInput {
  about: AboutInfo
  // The settings' primary_tool, or null when the engine didn't say.
  primaryTool: string | null
  // The last tool status read, or null before the first one.
  tools: ToolStatus[] | null
  // The end of engine.log (readLogTail), or null when there is none.
  log: string | null
  home: string
}

// The text Copy diagnostics puts on the clipboard, scrubbed.
export function diagnosticsText(input: DiagnosticsInput): string {
  const lines = ['Tearsheet diagnostics', ...versionLines(input.about)]
  if (input.primaryTool) lines.push(`Reports use: ${input.primaryTool}`)
  if (input.tools) lines.push(...input.tools.map(toolLine))
  else lines.push('AI tools: not read yet')
  lines.push('', `Last lines of engine.log (up to ${LOG_LINES}; emails, keys and your home folder removed):`)
  lines.push(input.log?.replace(/\n+$/, '') || 'No engine.log yet.')
  return scrub(lines.join('\n'), input.home)
}
