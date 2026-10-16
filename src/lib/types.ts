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
