/** One sale read from a ledger page, as sent by the backend. */
export type Entry = {
  date: string;
  item: string;
  quantity: string;
  amount: string;
  uncertainFields: string[];
};

export type Status = {
  running: boolean;
  binaryFound: boolean;
  models: string[];
  modelReady: boolean;
};

export type PullProgress = {
  status: string;
  completed: number | null;
  total: number | null;
};

export type ExtractOutcome = { count: number; cancelled: boolean };

export type SetupPhase = 'checking' | 'starting' | 'missing-ollama' | 'need-model' | 'downloading' | 'error' | 'ready';

/** What the interface can ask the app to do. Implemented in `src/main`, exposed by the preload script. */
export interface LedgerApi {
  defaultModel(): Promise<string>
  getStatus(model: string): Promise<Status>
  startOllama(): Promise<void>
  warmModel(model: string): Promise<void>
  /** Resolves when the download is finished. */
  pullModel(model: string, onProgress: (progress: PullProgress) => void): Promise<void>
  /** Reads one page. `onEntry` is called as each row is found, before the page is finished. */
  extractEntries(image: string, model: string, onEntry: (entry: Entry) => void): Promise<ExtractOutcome>
  cancelExtract(): Promise<void>
  /** Resolves to the saved path, or null if the owner closed the save dialog. */
  saveCsv(entries: Entry[], suggestedName: string): Promise<string | null>
  openDownloadPage(): Promise<void>
}
