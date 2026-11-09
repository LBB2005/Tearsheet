// The setup screen's list (first-run design item 33): three rows on top, Your AI, Price key and
// SEC email, each with the icon, words and actions screenView gives (setup/view.ts). The AI row is
// always on screen, so a sign-in that seems stuck offers its way out here, while the card below
// has moved on to the price key, without changing what is under the pointer. Ported from
// docs/designs/first-run/canvas/Spine.dc.html (.spine, .sr).

import type { ReactNode } from 'react'

import type { AiAction, AiRow, EmailRow, KeyRow, RowIcon, RowTone } from './view'
import { WORDS } from './words'

export function Tick() {
  return (
    <svg className="tick" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  )
}

// The key-cap picture of ⌘V, then Return, beside the paste command.
export function Keys() {
  return (
    <span className="keys" aria-label="Command V, then Return">
      <span className="kc">⌘</span>
      <span className="kc k2">V</span>
      <span className="then">then</span>
      <span className="kc k3">Return</span>
    </span>
  )
}

function Icon({ icon, n }: { icon: RowIcon; n: number }) {
  if (icon === 'done') return <Tick />
  if (icon === 'busy') return <span className="sp" aria-hidden="true" />
  return <span className="snum">{n}</span>
}

function Row({ tone, icon, n, label, children }: { tone: RowTone; icon: RowIcon; n: number; label: string; children: ReactNode }) {
  return (
    <div className={tone ? `sr ${tone}` : 'sr'} aria-label={label} role="group">
      <span>
        <Icon icon={icon} n={n} />
      </span>
      <span className="sl">{label}</span>
      <span className="sv">{children}</span>
    </div>
  )
}

export interface ListProps {
  ai: AiRow
  keyRow: KeyRow
  email: EmailRow
  // The AI row's actions, and what "Show the command again" shows.
  onAi: (action: AiAction) => void
  // Under the AI row: the command shown again, or the stuck sign-in's paste command.
  aiBelow?: ReactNode
  onOtherKey: () => void
  onChangeEmail: () => void
  // "Show the command again" is open.
  commandShown: boolean
}

export function List({ ai, keyRow, email, onAi, aiBelow, onOtherKey, onChangeEmail, commandShown }: ListProps) {
  return (
    <div className="spine mv" style={{ ['--i' as string]: 0 }}>
      <Row tone={ai.tone} icon={ai.icon} n={1} label="Your AI">
        {ai.connected.length > 0 ? (
          <span className="duo">
            {ai.connected.map((c) => (
              <span key={c.kind} className="duo1">
                <b className="chg">{c.name}</b>
                <span className="pill">
                  <i />
                  Connected
                </span>
                <span className="muted chg">{c.account}</span>
                {c.role && <span className="role">{c.role}</span>}
              </span>
            ))}
          </span>
        ) : (
          <span className="chg" key={ai.words ?? ''} aria-live="polite">
            {ai.words}
          </span>
        )}
        {ai.actions.includes('show_command') && (
          <button className="link" aria-expanded={commandShown} onClick={() => onAi('show_command')}>
            {commandShown ? WORDS.hideCommand : WORDS.showCommand}
          </button>
        )}
        {ai.actions.includes('stop_sign_in') && (
          <button className="link" onClick={() => onAi('stop_sign_in')}>
            {WORDS.stopSignIn}
          </button>
        )}
        {ai.actions.includes('open_sign_in') && (
          <button className="link" onClick={() => onAi('open_sign_in')}>
            {WORDS.openSignIn}
          </button>
        )}
      </Row>
      {aiBelow && <div className="srb">{aiBelow}</div>}
      <Row tone={keyRow.tone} icon={keyRow.icon} n={2} label="Price key">
        <span className="chg" key={keyRow.words}>
          {keyRow.words}
        </span>
        {keyRow.actions.includes('other_key') && (
          <button className="link" onClick={onOtherKey}>
            {WORDS.otherKey}
          </button>
        )}
      </Row>
      <Row tone={email.tone} icon={email.icon} n={3} label="SEC email">
        <span>{email.words}</span>
        {email.actions.includes('change') && (
          <button className="link" aria-label="Change the SEC email" onClick={onChangeEmail}>
            {WORDS.change}
          </button>
        )}
      </Row>
    </div>
  )
}
