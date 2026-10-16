import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Electron's own `electron` module only works from CommonJS.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // A sandboxed preload must be a CommonJS file.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } } }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [svelte()]
  }
})
