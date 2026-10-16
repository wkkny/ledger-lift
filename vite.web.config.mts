// Opens the interface in a plain browser against the fake backend (see src/renderer/src/lib/dev-backend.ts).
import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: { alias: { '@shared': resolve('src/shared'), $lib: resolve('src/renderer/src/lib') } },
  plugins: [tailwindcss(), svelte()],
  server: { host: '127.0.0.1', port: 1420, strictPort: true }
})
