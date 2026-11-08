// The Settings page's topics (pages/Settings.tsx): the list on the left with one page each, the
// keys that move through the list, what needs you (a dot on the topic and a note on General),
// and the line under each AI tool's name. Pure, so settings/topics.test.ts can pin it.

import type { ToolStatus } from '../../preload/api'
import type { ToolKind } from '../setup/steps'
import { healthTiles, storage, type HealthInput, type Tile } from './settings'

export type Topic = 'general' | 'appearance' | 'ai' | 'keys' | 'storage' | 'privacy' | 'advanced'

// In the order the list shows them. General opens first.
export const TOPICS: { id: Topic; name: string }[] = [
  { id: 'general', name: 'General' },
  { id: 'appearance', name: 'Appearance' },
  { id: 'ai', name: 'AI tools' },
  { id: 'keys', name: 'Data keys' },
  { id: 'storage', name: 'Storage and backup' },
  { id: 'privacy', name: 'Privacy' },
  { id: 'advanced', name: 'Advanced' }
]

export function topicName(topic: Topic): string {
  return TOPICS.find((t) => t.id === topic)?.name ?? 'General'
}

// The topic a key moves to in the list: the arrows go one step and stop at the ends, as Mac
// lists do, and Home and End go to the first and last. Any other key moves nothing (null).
export function moveTopic(current: Topic, key: string): Topic | null {
  const at = Math.max(0, TOPICS.findIndex((t) => t.id === current))
  const last = TOPICS.length - 1
  if (key === 'ArrowDown') return TOPICS[Math.min(at + 1, last)].id
  if (key === 'ArrowUp') return TOPICS[Math.max(at - 1, 0)].id
  if (key === 'Home') return TOPICS[0].id
  if (key === 'End') return TOPICS[last].id
  return null
}

// Something that needs you: its topic, a short title, one line on why it matters, the button
// that opens the topic, and its tone: red (bad) when new reports can't be written or rated,
// amber (hold) when they can.
export interface Problem {
  topic: Topic
  title: string
  detail: string
  action: string
  tone: 'bad' | 'hold'
}

// Massive's prices are needed for every report; FRED's economic data can be left out.
const KEY_NAMES: [string, string, string, Problem['tone']][] = [
  ['massive', 'Massive', 'Reports need it for prices.', 'bad'],
  ['fred', 'FRED', 'Reports leave out economic data until you add it.', 'hold']
]

// What needs you, most urgent first: the main AI tool, then the data keys, then storage. The
// same rules as the health tiles (settings.ts), which the page no longer shows: a red AI tile,
// a key that is missing or refused, and downloads near or over the storage limit.
export function problems(h: HealthInput): Problem[] {
  const [ai] = healthTiles(h)
  const out: Problem[] = []
  if (ai.tone === 'bad') out.push({ topic: 'ai', title: ai.text, detail: 'New reports can’t be written until this is fixed.', action: 'Open AI tools', tone: 'bad' })
  for (const [service, name, missing, tone] of KEY_NAMES) {
    if (h.keys[service] === 'locked') out.push({ topic: 'keys', title: `${name} key locked in the Keychain`, detail: 'macOS didn’t let Tearsheet open it. Quit Tearsheet, open it again, and click Always Allow when macOS asks.', action: 'Open data keys', tone })
    else if (h.keys[service] !== 'set') out.push({ topic: 'keys', title: `${name} key not added`, detail: missing, action: 'Add key', tone })
    else if (h.rejected?.includes(service)) out.push({ topic: 'keys', title: `${name} key not accepted`, detail: `${name} turned it down on its last call.`, action: 'Replace key', tone })
  }
  const space = storage(h.rawBytes, h.rawCap)
  if (space.tone === 'hold') {
    out.push({ topic: 'storage', title: `Downloads are ${space.over ? 'over' : 'near'} the storage limit`, detail: `${space.used} of ${space.cap} used.`, action: 'Open storage', tone: 'hold' })
  }
  return out
}

// The topics that get a dot in the list, each in the worst tone of its problems.
export function needsYou(found: Problem[]): Map<Topic, Problem['tone']> {
  const dots = new Map<Topic, Problem['tone']>()
  for (const p of found) if (dots.get(p.topic) !== 'bad') dots.set(p.topic, p.tone)
  return dots
}

// "2.1.317" from "2.1.317 (Claude Code)" or "codex-cli 0.165.0"; the text as it is otherwise.
export function shortVersion(version: string): string {
  return /\d+(?:\.\d+)+/.exec(version)?.[0] ?? version
}

// The line under an AI tool's name: what it does for Tearsheet, then its version. The other
// tool checks the drafts only while the skeptic tile (settings.ts) says it does.
export function toolRole(tool: ToolStatus, primary: ToolKind, skeptic: Tile): string {
  if (!tool.available) return tool.reason || 'Not found on this Mac'
  const role = tool.kind === primary ? 'Writes your reports' : skeptic.tone === 'ok' ? 'Checks each draft' : skeptic.tone === 'run' ? 'Checks each draft once its safety check passes' : 'Not checking drafts'
  return tool.version ? `${role} · version ${shortVersion(tool.version)}` : role
}
