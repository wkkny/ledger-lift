import { Channel, invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Entry, ExtractOutcome, PullProgress, Status } from './types';

export const defaultModel = () => invoke<string>('default_model');
export const getStatus = (model: string) => invoke<Status>('get_status', { model });
export const startOllama = () => invoke<void>('start_ollama');
export const warmModel = (model: string) => invoke<void>('warm_model', { model });
export const cancelExtract = () => invoke<void>('cancel_extract');
export const openDownloadPage = () => openUrl('https://ollama.com/download');

export function pullModel(model: string, onProgress: (progress: PullProgress) => void) {
  const channel = new Channel<PullProgress>();
  channel.onmessage = onProgress;
  return invoke<void>('pull_model', { model, onProgress: channel });
}

/** Reads one page. `onEntry` is called as each row is found, before the page is finished. */
export function extractEntries(image: string, model: string, onEntry: (entry: Entry) => void) {
  const channel = new Channel<Entry>();
  channel.onmessage = onEntry;
  return invoke<ExtractOutcome>('extract_entries', { image, model, onEntry: channel });
}

/** Returns the saved path, or null if the owner closed the save dialog. */
export const saveCsv = (entries: Entry[], suggestedName: string) =>
  invoke<string | null>('save_csv', { entries, suggestedName });

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
