// Drives the built app with Playwright. Needs a running or installed Ollama and LEDGER_TEST_IMAGE.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['e2e/**/*.test.ts'], testTimeout: 300_000, hookTimeout: 120_000, fileParallelism: false }
})
