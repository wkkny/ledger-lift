// Opens the interface in a plain browser against the fake backend (see src/renderer/src/lib/dev-backend.ts).
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
  plugins: [tailwindcss(), react()],
  server: { host: '127.0.0.1', port: 1420, strictPort: true }
})
