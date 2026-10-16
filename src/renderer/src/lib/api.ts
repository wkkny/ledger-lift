// The interface's view of the app: everything goes through the preload bridge on `window.ledger`.
import type { LedgerApi } from '@shared/types'

const ledger = (): LedgerApi => window.ledger

export const defaultModel: LedgerApi['defaultModel'] = () => ledger().defaultModel()
export const getStatus: LedgerApi['getStatus'] = (model) => ledger().getStatus(model)
export const startOllama: LedgerApi['startOllama'] = () => ledger().startOllama()
export const warmModel: LedgerApi['warmModel'] = (model) => ledger().warmModel(model)
export const pullModel: LedgerApi['pullModel'] = (model, onProgress) => ledger().pullModel(model, onProgress)
export const extractEntries: LedgerApi['extractEntries'] = (image, model, onEntry) => ledger().extractEntries(image, model, onEntry)
export const cancelExtract: LedgerApi['cancelExtract'] = () => ledger().cancelExtract()
export const saveCsv: LedgerApi['saveCsv'] = (entries, suggestedName) => ledger().saveCsv(entries, suggestedName)
export const openDownloadPage: LedgerApi['openDownloadPage'] = () => ledger().openDownloadPage()

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
