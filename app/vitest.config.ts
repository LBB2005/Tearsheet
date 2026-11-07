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
      reporter: ['text-summary', 'text', 'html'],
      // The floor CI holds the app to (npm run coverage). Raise it as tests land; never lower it
      // to make a change pass.
      thresholds: { lines: 60, statements: 60, functions: 55, branches: 60 }
    }
  }
})
