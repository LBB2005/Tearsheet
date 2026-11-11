// The fixed "not advice" line, the same everywhere the app shows it (docs/launch/launch-readiness.md,
// S6). The engine keeps the same words in engine/src/tearsheet/wording.py for the report and the
// downloads; wording.test.ts checks the two match.

export const ADVICE_SHORT = 'General research, not personalised investment advice.'
export const ADVICE_LINE = `${ADVICE_SHORT} Check the sources and make your own decisions.`
