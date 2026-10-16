import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

async function start() {
  // Opened in a plain browser (`pnpm web`) there is no app behind the page, so use a fake one.
  if (import.meta.env.DEV && !window.ledger) (await import('./lib/dev-backend')).installDevBackend()
  mount(App, { target: document.getElementById('app')! })
}

void start()
