// Settings → About and help (docs/launch/launch-readiness.md, M7-M9): the version numbers a
// person can quote, Send feedback, and the short help a stranger needs: what Tearsheet is, its
// terms of use, what it keeps private, how to uninstall it, and the notices it must show (FRED's
// own sentence and a link to FRED's terms). Like Appearance, it needs nothing from the engine.

import { useEffect, useState } from 'react'

import type { AboutInfo } from '../../main/about'
import { FEEDBACK_EMAIL } from '../../shared/feedback'
import { ADVICE_SHORT } from '../../shared/wording'
import { Label } from './General'

// FRED's terms ask every application that uses its API to show this sentence, and a link to the
// terms, to its users.
export const FRED_NOTICE = 'This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.'
export const FRED_TERMS = 'https://fred.stlouisfed.org/docs/api/terms_of_use.html'

export const TERMS: string[] = [
  `${ADVICE_SHORT} Tearsheet is not a broker or an investment adviser. Check the sources and make your own decisions.`,
  'Reports can be wrong, late or incomplete. Tearsheet is free, open-source software under the MIT licence, provided as is, with no warranty.',
  'Your AI plan and the data services you sign up for (SEC, Massive and FRED) have their own terms, and they apply to your use. Massive’s prices are for your own use, so don’t share downloads that contain them.',
  'Each company’s first rated report in any 30 days is logged as an official prediction, and it can’t be changed afterwards.'
]

export const UNINSTALL: string[] = [
  'Quit Tearsheet, then move it from Applications to the Trash.',
  'Delete the folder ~/Library/Application Support/Tearsheet, which holds your reports, the prediction log and the downloaded data. If you made backups, delete ~/Tearsheet Backups too.',
  'In Keychain Access, delete the items named Tearsheet (your data keys) and Tearsheet Safe Storage.',
  'Files you downloaded from reports stay in your Downloads folder until you delete them.'
]

export function AboutPage({ onPrivacy }: { onPrivacy: () => void }) {
  const [info, setInfo] = useState<AboutInfo | null>(null)
  // Copy diagnostics' answer, shown beside its button until the next press.
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)
  const copyDiagnostics = () => {
    setCopied(null)
    window.tearsheet.copyDiagnostics().then(
      (ok) => setCopied(ok ? 'copied' : 'failed'),
      () => setCopied('failed')
    )
  }
  useEffect(() => {
    let live = true
    window.tearsheet.about().then(
      (i) => live && setInfo(i),
      () => undefined
    )
    return () => {
      live = false
    }
  }, [])
  const version = info ? `Tearsheet ${info.app}${info.engine ? ` · engine ${info.engine}` : ''}` : 'Tearsheet'

  return (
    <>
      <h2 className="sh2">About and help</h2>
      <p className="slead">{version}</p>
      <div className="sgrp">
        <div className="sline">
          <Label title="Send feedback" help={`Opens a new email to ${FEEDBACK_EMAIL} in your Mail app, with these version numbers filled in. Nothing is sent until you send it.`} />
          <button className="pb" onClick={() => void window.tearsheet.sendFeedback()}>
            Send feedback
          </button>
        </div>
        <div className="sline">
          <Label
            title="Copy diagnostics"
            help="Copies the version numbers, your AI tool and the last 200 lines of Tearsheet’s log, with emails, keys and your home folder taken out, so you can paste them into a feedback email. Nothing is sent anywhere."
          />
          {copied && (
            <span className="sval" role="status">
              {copied === 'copied' ? 'Copied.' : 'Couldn’t copy. Try again.'}
            </span>
          )}
          <button className="pb" onClick={copyDiagnostics}>
            Copy diagnostics
          </button>
        </div>
        {info && (
          <div className="sline">
            <Label title="Versions" help={`Tearsheet ${info.app}, engine ${info.engine ?? 'not running'}, macOS ${info.macos}, Electron ${info.electron}.`} />
          </div>
        )}
      </div>
      <div className="sgrp">
        <div className="sline col">
          <Label
            title="What Tearsheet is"
            help="Tearsheet writes research reports on S&P 500 companies. Code makes every number from public data. Your own AI tool reads the filings and writes the cited text, and checks remove any claim its sources don’t support."
          />
        </div>
      </div>
      <div className="sgrp">
        <div className="sline col">
          <Label title="Terms of use" />
          <ol className="help about-list">
            {TERMS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      </div>
      <div className="sgrp">
        <div className="sline">
          <Label title="Privacy" help="Tearsheet sends nothing to its author: no accounts, no usage tracking, no crash reports. Your reports, prediction log, downloads and keys stay on this Mac. What goes to outside services is listed under Privacy." />
          <button className="pb" onClick={onPrivacy}>
            Open Privacy
          </button>
        </div>
      </div>
      <div className="sgrp">
        <div className="sline col">
          <Label title="Uninstall" />
          <ol className="help about-list">
            {UNINSTALL.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      </div>
      <div className="sgrp">
        <div className="sline">
          <Label title="FRED" help={FRED_NOTICE} />
          <button className="pb" onClick={() => void window.tearsheet.openExternal(FRED_TERMS)}>
            FRED’s terms
          </button>
        </div>
        <div className="sline">
          <Label title="Open-source licences" help="Tearsheet’s own code is under the MIT licence. The licences of the software it includes are in THIRD-PARTY-NOTICES.md, in the app’s Resources folder." />
        </div>
      </div>
    </>
  )
}
