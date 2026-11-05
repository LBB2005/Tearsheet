// AI tool detection (design item 43; adapted from Realm, MIT): walk PATH, run `--version` with a
// 5-second limit, and read the sign-in status (reading output even on a non-zero exit). Results
// are cached for 30 seconds; "Check again" skips the cache. Tool credential files are never read.

import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'

import { TOOLS, type ToolSpec, type ToolStatus } from './tools'

const TIMEOUT_MS = 5000
const CACHE_MS = 30_000

let cache: { at: number; result: ToolStatus[] } | null = null

export function findOnPath(binary: string, pathValue: string): string | null {
  for (const dir of pathValue.split(':').filter(Boolean)) {
    const candidate = join(dir, binary)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // not here
    }
  }
  return null
}

function run(path: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(path, args, { timeout: TIMEOUT_MS, env, encoding: 'utf8' }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0
      resolve({ code, out: `${stdout ?? ''}${stderr ?? ''}` })
    })
  })
}

export function readLoggedIn(kind: ToolSpec['kind'], output: string): boolean | null {
  if (kind === 'claude') {
    try {
      const data = JSON.parse(output.slice(output.indexOf('{')))
      if (typeof data.loggedIn === 'boolean') return data.loggedIn
    } catch {
      // not JSON
    }
    if (/not logged in|please run \/login/i.test(output)) return false
    return null
  }
  if (/not logged in/i.test(output)) return false
  if (/logged in/i.test(output)) return true
  return null
}

async function probeOne(spec: ToolSpec, pathValue: string): Promise<ToolStatus> {
  const env = { ...process.env, PATH: pathValue }
  const path = process.env[spec.overrideEnv] || findOnPath(spec.binary, pathValue)
  const base = { kind: spec.kind, name: spec.name, path: path ?? null }
  if (!path) return { ...base, available: false, version: null, loggedIn: null, reason: `${spec.binary} wasn't found on your PATH.` }
  const version = await run(path, spec.versionArgs, env)
  if (version.code !== 0) {
    return { ...base, available: false, version: null, loggedIn: null, reason: `${spec.binary} --version didn't answer.` }
  }
  const status = await run(path, spec.statusArgs, env)
  return {
    ...base,
    available: true,
    version: version.out.trim().split('\n')[0] || null,
    loggedIn: readLoggedIn(spec.kind, status.out),
    reason: null
  }
}

export async function getTools(pathValue: string, force = false): Promise<ToolStatus[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.result
  const result = await Promise.all(TOOLS.map((spec) => probeOne(spec, pathValue)))
  cache = { at: Date.now(), result }
  return result
}
