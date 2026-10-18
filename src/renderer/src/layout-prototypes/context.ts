// PROTOTYPE (throwaway): everything a layout variant needs from App. Variants only change how it is drawn.
import type { ReactNode } from 'react'
import type { SetupPhase } from '@shared/types'
import type { Row } from '@/lib/review'

export type Ctx = {
  setup: ReactNode
  ready: boolean
  phase: SetupPhase
  model: string
  models: string[]
  setModel: (model: string) => void
  file: File | null
  turns: number
  onTurn: (step: number) => void
  onChoose: (file: File) => void
  onClear: () => void
  onReject: (message: string) => void
  rows: Row[]
  setRows: (rows: Row[]) => void
  keptRows: number
  reading: boolean
  elapsed: number
  saving: boolean
  message: string
  notice: string
  read: () => void
  stop: () => void
  save: () => void
  addPage: () => void
  restart: () => void
}
