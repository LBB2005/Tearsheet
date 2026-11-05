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
  main: { build: { outDir: 'out/main' } },
  preload: { build: { outDir: 'out/preload' } },
  renderer: { plugins: [react(), devCsp], build: { outDir: 'out/renderer' } }
})
