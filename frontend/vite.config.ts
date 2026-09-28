import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Short git SHA stamped into bug reports (see src/diagnostics). APP_VERSION
// overrides it for builds outside a git checkout.
function appVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  build: {
    // .map files are emitted but not referenced from the bundle, so browsers
    // don't load them — they're for decoding minified stacks in bug reports.
    sourcemap: 'hidden',
  },
})
