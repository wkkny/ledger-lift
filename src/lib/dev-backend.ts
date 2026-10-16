/** A fake backend so `pnpm dev` can be opened in a plain browser. Never bundled into the real app.
 * Pick a starting screen with ?scenario=missing-ollama | need-model | empty | error (default: ready),
 * and slow the rows down with ?rowDelay=<milliseconds>. */
import { mockIPC } from '@tauri-apps/api/mocks';
import type { Channel } from '@tauri-apps/api/core';
import type { Entry, PullProgress } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ROWS: Entry[] = [
  { date: '5/10', item: 'Cooking oil 2L', quantity: '3', amount: '2940', uncertainFields: [] },
  { date: '5/10', item: 'Biscuits', quantity: '4', amount: '600', uncertainFields: [] },
  { date: '5/10', item: 'Bar soap', quantity: '4', amount: '', uncertainFields: ['amount'] },
  { date: '5/10', item: 'Lentils 1kg', quantity: '4', amount: '1520', uncertainFields: [] },
  { date: '5/10', item: 'Rice 5kg', quantity: '1', amount: '1450', uncertainFields: [] },
];

export function installDevBackend() {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') ?? 'ready';
  const rowDelay = Number(params.get('rowDelay') ?? 700);
  let ollamaInstalled = scenario !== 'missing-ollama';
  let ollamaRunning = scenario === 'ready' || scenario === 'empty' || scenario === 'error' || scenario === 'need-model';
  let modelInstalled = scenario !== 'need-model';
  let cancelled = false;
  const w = window as unknown as { __saved?: unknown; __calls: string[] };
  w.__calls = [];

  mockIPC(async (command, args) => {
    w.__calls.push(command);
    const payload = (args ?? {}) as Record<string, unknown>;
    switch (command) {
      case 'default_model':
        return 'qwen3-vl:2b-instruct';
      case 'get_status':
        await sleep(300);
        return { running: ollamaRunning, binaryFound: ollamaInstalled, models: modelInstalled ? ['qwen3-vl:2b-instruct'] : [], modelReady: ollamaRunning && modelInstalled };
      case 'start_ollama':
        await sleep(800);
        ollamaRunning = true;
        return;
      case 'pull_model': {
        const channel = payload.onProgress as Channel<PullProgress>;
        for (const percent of [0, 20, 55, 90, 100]) {
          channel.onmessage({ status: 'pulling model', completed: percent * 19_000_000, total: 1_900_000_000 });
          await sleep(500);
        }
        modelInstalled = true;
        return;
      }
      case 'warm_model':
        return;
      case 'cancel_extract':
        cancelled = true;
        return;
      case 'extract_entries': {
        cancelled = false;
        const channel = payload.onEntry as Channel<Entry>;
        await sleep(600);
        if (scenario === 'error') throw 'Ollama returned an error (400 Bad Request). request exceeds the available context size';
        if (scenario === 'empty') throw 'No sales rows found. Try a closer, brighter photo.';
        let count = 0;
        for (const row of ROWS) {
          if (cancelled) return { count, cancelled: true };
          channel.onmessage(row);
          count += 1;
          await sleep(rowDelay);
        }
        return { count, cancelled: false };
      }
      case 'save_csv':
        w.__saved = payload;
        return '/Users/demo/Documents/ledger-entries.csv';
    }
  });
}
