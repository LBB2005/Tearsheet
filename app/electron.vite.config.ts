import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

// The window's content-security policy is a meta tag in index.html (design item 42). The dev
// server's hot reload needs inline scripts and a socket, so the tag is dropped only there.
const devCsp: Plugin = {
  name: 'tearsheet-dev-csp',
  transformIndexHtml(html, ctx) {
    return ctx.server ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '') : html
  }
}

export default defineConfig({
  // A test build (`npm run package:test`, docs/test-builds.md) honours the development and test
  // hooks; every other packaged build ignores them (src/main/devHooks.ts).
  main: {
    build: { outDir: 'out/main' },
    define: { __TEARSHEET_TEST_BUILD__: JSON.stringify(process.env.TEARSHEET_TEST_BUILD === '1') }
  },
  preload: { build: { outDir: 'out/preload' } },
  renderer: { plugins: [react(), devCsp], build: { outDir: 'out/renderer' } }
})
