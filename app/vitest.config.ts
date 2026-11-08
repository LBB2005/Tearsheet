import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Logic tests (.test.ts) run in Node. Screen tests (.test.tsx) run the React screens in jsdom, with
// the engine's bridge faked (src/renderer/test/bridge.ts), so no engine starts.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**/*.test.tsx', 'jsdom']],
    setupFiles: ['src/renderer/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/renderer/test/**', 'src/**/*.d.ts', 'src/shared/protocol.ts'],
      // In the terminal, and as a page at coverage/index.html.
      reporter: ['text-summary', 'text', 'html'],
      // The floor CI holds the app to (npm run coverage), a little under the numbers of
      // 2026-11-07: the whole app at 93.6% of lines, the screens (.tsx) at 97.9%. Raise it as
      // tests land; never lower it to let a change through.
      thresholds: {
        lines: 91,
        statements: 91,
        functions: 94,
        branches: 88,
        'src/renderer/**/*.tsx': { lines: 96, statements: 96, functions: 95, branches: 86 }
      }
    }
  }
})
