// The fixed "not advice" line, the same everywhere the app shows it (docs/launch/launch-readiness.md,
// S6). The engine keeps the same words in engine/src/tearsheet/wording.py for the report and the
// downloads; wording.test.ts checks the two match.

export const ADVICE_SHORT = 'General research, not personalised investment advice.'
export const ADVICE_LINE = `${ADVICE_SHORT} Check the sources and make your own decisions.`

// Under Dig deeper's AI take, in its Next move box: the Buy price is code's (engine wording.py).
export const TAKE_LINE = 'The Buy price is the report’s, worked out by code. The AI never sets a price.'
