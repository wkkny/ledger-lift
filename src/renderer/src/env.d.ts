/// <reference types="vite/client" />

import type { LedgerApi } from '@shared/types'

declare global {
  interface Window {
    /** Provided by the preload script. */
    ledger: LedgerApi
  }
}
