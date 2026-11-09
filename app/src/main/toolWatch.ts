// The one owner of the tools' status reads (first-run design §1, item 5). It runs one read at a
// time and gives every caller the same answer, and it reads only while the window is in front:
// every 5 seconds while the screen waits on the person (setup, or Home waiting on a tool), and
// once each time the window comes back. On a change it emits `changed`, which ipc.ts sends to the
// window as a tools_changed notification, so the window never polls.

import { EventEmitter } from 'node:events'

import type { ToolStatus } from '../shared/tools'

export const WATCH_MS = 5000

export interface ToolWatchOptions {
  // One full read of both tools (Probe.getTools).
  probe: () => Promise<ToolStatus[]>
  // How often it reads while focused and waiting, and how long an answer counts as fresh.
  everyMs?: number
}

export class ToolWatch extends EventEmitter {
  private last: { at: number; tools: ToolStatus[] } | null = null
  private underway: Promise<ToolStatus[]> | null = null
  private focused = false
  private waiting = false
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly everyMs: number

  constructor(private readonly options: ToolWatchOptions) {
    super()
    this.everyMs = options.everyMs ?? WATCH_MS
  }

  // A read already under way is shared. Without `force`, an answer under 5 seconds old is reused.
  read(force = false): Promise<ToolStatus[]> {
    if (this.underway) return this.underway
    if (!force && this.last && Date.now() - this.last.at < this.everyMs) return Promise.resolve(this.last.tools)
    const underway = this.options
      .probe()
      .then((tools) => {
        const changed = !this.last || JSON.stringify(this.last.tools) !== JSON.stringify(tools)
        this.last = { at: Date.now(), tools }
        if (changed) this.emit('changed', tools)
        return tools
      })
      .finally(() => {
        if (this.underway === underway) this.underway = null
      })
    this.underway = underway
    return underway
  }

  // The last answer, if any (for tests and the first-paint fallbacks).
  get current(): ToolStatus[] | null {
    return this.last?.tools ?? null
  }

  onWindowFocus(): void {
    this.focused = true
    void this.read(true).catch(() => undefined)
    this.schedule()
  }

  onWindowBlur(): void {
    this.focused = false
    this.schedule()
  }

  setWaiting(waiting: boolean): void {
    this.waiting = waiting
    this.schedule()
  }

  stop(): void {
    this.focused = false
    this.schedule()
  }

  // The timer runs only while the window is in front and waiting on the person.
  private schedule(): void {
    const want = this.focused && this.waiting
    if (want && !this.timer) {
      this.timer = setInterval(() => void this.read(true).catch(() => undefined), this.everyMs)
    } else if (!want && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
