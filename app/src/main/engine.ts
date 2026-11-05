// The engine process (design item 44). Starts `tearsheet-engine serve`, speaks JSON-RPC over
// its standard input and output, writes its standard error to the log file, checks the hello
// line's protocol version, relays notifications, and restarts the engine if it crashes.

import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'

import { PROTOCOL_VERSION, type Hello } from '../shared/protocol'

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

  constructor(private readonly options: EngineOptions) {
    super()
    mkdirSync(dirname(options.logFile), { recursive: true })
    this.log = createWriteStream(options.logFile, { flags: 'a' })
  }

  start(): void {
    this.stopping = false
    const child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    child.stderr?.on('data', (chunk) => this.log.write(chunk))
    createInterface({ input: child.stdout! }).on('line', (line) => this.onLine(line))
    child.on('exit', (code, signal) => {
      this.log.write(`\n[engine exited: code ${code} signal ${signal}]\n`)
      for (const { reject } of this.pending.values()) reject(new Error('The engine stopped.'))
      this.pending.clear()
      this.child = null
      if (!this.stopping) {
        this.emit('crashed', this.lastRunId)
        setTimeout(() => this.start(), 1000)
      }
    })
    child.on('error', (error) => {
      this.log.write(`\n[engine failed to start: ${error.message}]\n`)
      this.emit('fatal', `The engine couldn't start: ${error.message}`)
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
        this.emit('fatal', "The app and engine versions don't match.")
        this.stop()
        return
      }
    }
    this.emit('notification', note)
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.child?.stdin) return Promise.reject(new Error('The engine is not running.'))
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
