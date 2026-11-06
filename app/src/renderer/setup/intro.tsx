// Setup's first two screens: First open, and How it works.

import { Mark } from '../mark/Mark'
import { at } from './parts'

const PROMISES = [
  'Every number is computed by code from public data: filings, prices and economic figures.',
  'Every sentence links to the filing or article it came from.',
  'Everything is kept on your Mac.'
]

// 1. First open: the name, one line on what Tearsheet is, three short lines and one button.
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="col center wel">
      <Mark size={64} />
      <h1 className="h1 xl mv" style={at(1)}>
        Tearsheet
      </h1>
      <p className="lead mv" style={at(2)}>
        One cited research report on any S&amp;P 500 company, written by your own Claude and checked against the filings.
      </p>
      <div className="trio">
        {PROMISES.map((text, k) => (
          <div key={k} className="mv" style={at(3 + k)}>
            <span className="dot" />
            {text}
          </div>
        ))}
      </div>
      <div className="row mv" style={at(6)}>
        <button className="btn big" onClick={onStart}>
          Set up Tearsheet
        </button>
      </div>
      <p className="fine mv" style={at(7)}>
        About 5 minutes. You’ll need a paid Claude plan. Research to read, not investment advice.
      </p>
    </div>
  )
}

// The lines from Tearsheet in the middle to Claude Code on the left and the three data
// services on the right, in the picture's own 820 × 300 grid.
const LINES = ['M210 150 H300', 'M540 150 C575 150 575 44 610 44', 'M540 150 H610', 'M540 150 C575 150 575 256 610 256']

function Node({ x, y, i, title, text, hub }: { x: number; y: number; i: number; title: string; text: string; hub?: boolean }) {
  return (
    <div className="anc" style={{ left: x, top: y }}>
      <div className={hub ? 'nd hub mv' : 'nd mv'} style={at(i)}>
        <b>{title}</b>
        <span>{text}</span>
      </div>
    </div>
  )
}

// 2. How it works: Tearsheet on the Mac in the middle, Claude Code on one side, and SEC
// EDGAR, Massive and FRED on the other, then what leaves the Mac.
export function HowItWorks({ onNext }: { onNext: () => void }) {
  return (
    <div className="col wide">
      <h1 className="h1 mv" style={at(0)}>
        How Tearsheet works
      </h1>
      <p className="lead mv" style={at(1)}>
        Tearsheet runs on your Mac. These are the four services you’ll connect next, and each takes about a minute.
      </p>
      <div className="dia">
        <svg className="dl" viewBox="0 0 820 300" aria-hidden="true">
          {LINES.map((d, k) => (
            <path key={k} className="mv-l" style={at(k + 3)} d={d} />
          ))}
        </svg>
        <Node x={0} y={150} i={3} title="Claude Code" text="Reads the filings and writes the report, on your Claude plan" />
        <Node x={300} y={150} i={2} title="Tearsheet, on your Mac" text="Does every calculation. Keeps every report and download." hub />
        <Node x={610} y={44} i={4} title="SEC EDGAR" text="Company filings. Free; SEC asks for your email" />
        <Node x={610} y={150} i={5} title="Massive" text="Daily closing prices. Free key" />
        <Node x={610} y={256} i={6} title="FRED" text="Economic figures. Free key, optional" />
      </div>
      <div className="card mv leaves" style={at(7)}>
        <b>What leaves your Mac</b>
        <span>The companies you look up, and the filing and article text Claude reads. Never your own files.</span>
      </div>
      <div className="row mv" style={at(8)}>
        <button className="btn" onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  )
}
