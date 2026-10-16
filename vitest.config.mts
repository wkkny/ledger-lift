import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), $lib: resolve('src/renderer/src/lib') } },
  test: { include: ['src/**/*.test.ts'], exclude: ['src/**/*.live.test.ts'] }
})
