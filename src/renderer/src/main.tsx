import { createRoot } from 'react-dom/client'
import './app.css'
import App from './App'

// Follow the system light or dark setting.
const dark = matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

async function start() {
  // Opened in a plain browser (`pnpm web`) there is no app behind the page, so use a fake one.
  if (import.meta.env.DEV && !window.ledger) (await import('./lib/dev-backend')).installDevBackend()
  createRoot(document.getElementById('root')!).render(<App />)
}

void start()
