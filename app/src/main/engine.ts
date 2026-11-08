// The engine process (design item 44). Starts `tearsheet-engine serve` (engineCommand says from
// where), speaks JSON-RPC over its standard input and output, writes its standard error to the
// log file, checks the hello line's protocol version, relays notifications, and restarts the
// engine if it crashes. A call
// never hangs: when the engine can't start, stops, or doesn't match, every waiting call and
// every later one is answered with why (fatalMessage, or "The engine stopped.").

import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { PROTOCOL_VERSION, type Hello } from '../shared/protocol'

export interface EngineCommand {
  command: string
  args: string[]
  cwd: string
}

export interface EngineHome {
  packaged: boolean
  // Tearsheet.app/Contents/Resources (process.resourcesPath) and the app's own folder
  // (app.getAppPath()): app/ in development.
  resourcesPath: string
  appPath: string
  dataDir: string
  // TEARSHEET_REPO, to run another checkout's engine in development.
  repo?: string
}

// Where the engine comes from. The packaged app runs its own copy, which
// scripts/build-engine.sh builds (a standalone Python with the engine installed in it) and
// electron-builder puts in Contents/Resources/engine. Development runs this repository's engine
// through uv. Both use the same data folder, which the engine is told through TEARSHEET_DATA_DIR.
export function engineCommand(home: EngineHome): EngineCommand {
  if (home.packaged) {
    return {
      command: join(home.resourcesPath, 'engine', 'bin', 'Tearsheet Engine'),
      // -I: only the app's own packages (no PYTHONPATH, no packages from the user's folder).
      // -B: never write compiled files inside the app; they were compiled when it was built.
      args: ['-I', '-B', '-m', 'tearsheet.cli', 'serve'],
      cwd: home.dataDir
    }
  }
  const repo = home.repo || resolve(home.appPath, '..')
  return { command: 'uv', args: ['run', '--project', join(repo, 'engine'), 'tearsheet-engine', 'serve'], cwd: repo }
}

export interface EngineOptions {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  logFile: string
}

export interface Notification {
  method: string
  params: Record<string, unknown>
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: { code?: string } & Record<string, unknown>
  ) {
    super(message)
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export class Engine extends EventEmitter {
  private child: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private stopping = false
  private log: WriteStream
  hello: Hello | null = null
  lastRunId: string | null = null
  // Why the engine can't be used, once that is known: it couldn't start, or its version doesn't
  // match. It is kept, so a window that loads after the failure still learns of it.
  fatalMessage: string | null = null

  constructor(private readonly options: EngineOptions) {
    super()
    mkdirSync(dirname(options.logFile), { recursive: true })
    this.log = createWriteStream(options.logFile, { flags: 'a' })
    // The log is kept as best it can be: a log that can't be opened or written (a removed or
    // locked logs folder) must never take the main process down.
    this.log.on('error', () => undefined)
  }

  start(): void {
    this.stopping = false
    this.fatalMessage = null
    const child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    let spawned = false
    child.on('spawn', () => {
      spawned = true
    })
    child.stderr?.on('data', (chunk) => this.log.write(chunk))
    // Writing to an engine that has just gone fails here, not in the main process.
    child.stdin?.on('error', (error) => this.log.write(`\n[engine standard input: ${error.message}]\n`))
    createInterface({ input: child.stdout! }).on('line', (line) => this.onLine(line))
    // This child is gone: answer every waiting call with why. False if it was already handled.
    const gone = (why: string): boolean => {
      if (this.child !== child) return false
      this.child = null
      for (const { reject } of this.pending.values()) reject(new Error(why))
      this.pending.clear()
      return true
    }
    child.on('exit', (code, signal) => {
      this.log.write(`\n[engine exited: code ${code} signal ${signal}]\n`)
      if (!gone(this.fatalMessage ?? 'The engine stopped.')) return
      if (!this.stopping && spawned) {
        this.emit('crashed', this.lastRunId)
        setTimeout(() => {
          if (!this.stopping) this.start()
        }, 1000)
      }
    })
    // Node sends no exit for a program that couldn't be started, only this.
    child.on('error', (error) => {
      if (spawned) {
        this.log.write(`\n[engine process error: ${error.message}]\n`)
        return
      }
      this.log.write(`\n[engine failed to start: ${error.message}]\n`)
      this.fatalMessage = `The engine couldn’t start: ${error.message}`
      gone(this.fatalMessage)
      this.emit('fatal', this.fatalMessage)
    })
  }

  private onLine(line: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line)
    } catch {
      this.log.write(`[not a protocol message on standard output] ${line}\n`)
      return
    }
    if ('id' in message && message.id !== null && message.id !== undefined) {
      const waiting = this.pending.get(message.id as number)
      if (!waiting) return
      this.pending.delete(message.id as number)
      if ('error' in message) {
        const error = message.error as { message: string; code: number; data?: Record<string, unknown> }
        waiting.reject(new EngineError(error.message, error.code, error.data as EngineError['data']))
      } else {
        waiting.resolve(message.result)
      }
      return
    }
    const note = message as unknown as Notification
    if (note.method === 'hello') {
      this.hello = note.params as unknown as Hello
      this.log.write(`[hello] ${JSON.stringify(note.params)}\n`)
      if (this.hello.protocol_version !== PROTOCOL_VERSION) {
        this.fatalMessage = 'The app and engine versions don’t match.'
        this.emit('fatal', this.fatalMessage)
        this.stop()
        return
      }
    }
    this.emit('notification', note)
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.child?.stdin || this.child.stdin.destroyed) return Promise.reject(new Error(this.fatalMessage ?? 'The engine is not running.'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.child!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  stop(): void {
    this.stopping = true
    this.child?.stdin?.end()
    this.child?.kill()
  }
}
