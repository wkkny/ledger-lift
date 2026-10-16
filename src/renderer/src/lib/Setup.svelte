<script lang="ts">
  import { untrack } from 'svelte';
  import { errorText, getStatus, openDownloadPage, pullModel, startOllama, warmModel } from './api';
  import type { PullProgress, SetupPhase } from '@shared/types';

  let { model, phase = $bindable('checking') }: { model: string; phase: SetupPhase } = $props();

  let attempt = $state(0);
  let detail = $state('');
  let progress = $state<PullProgress | null>(null);
  let latestCheck = 0;

  const percent = $derived(progress?.total ? Math.round((100 * (progress.completed ?? 0)) / progress.total) : null);

  /** Walks the owner's setup: Ollama installed, running, and the model downloaded. */
  async function check(modelName: string) {
    const mine = ++latestCheck;
    const superseded = () => mine !== latestCheck;
    phase = 'checking';
    detail = '';
    try {
      let status = await getStatus(modelName);
      if (superseded()) return;
      if (!status.running) {
        if (!status.binaryFound) {
          phase = 'missing-ollama';
          return;
        }
        phase = 'starting';
        await startOllama();
        if (superseded()) return;
        status = await getStatus(modelName);
        if (superseded()) return;
      }
      if (!status.modelReady) {
        phase = 'need-model';
        return;
      }
      phase = 'ready';
      void warmModel(modelName);
    } catch (error) {
      if (superseded()) return;
      detail = errorText(error);
      phase = 'error';
    }
  }

  async function download() {
    phase = 'downloading';
    progress = null;
    detail = '';
    try {
      await pullModel(model, (update) => (progress = update));
      await check(model);
    } catch (error) {
      detail = errorText(error);
      phase = 'error';
    }
  }

  $effect(() => {
    const name = model;
    void attempt;
    untrack(() => check(name));
  });
</script>

{#if phase !== 'ready'}
  <section class="setup" aria-live="polite">
    {#if phase === 'checking'}
      <p>Checking that the reading model is ready…</p>
    {:else if phase === 'starting'}
      <p>Starting Ollama…</p>
    {:else if phase === 'missing-ollama'}
      <h2>Install Ollama to read pages on this computer</h2>
      <p>Ollama runs the reading model locally, so your ledger photos never leave this computer. Install it, then come back here.</p>
      <div class="setup-actions">
        <button class="setup-button" onclick={openDownloadPage}>Download Ollama</button>
        <button class="setup-button secondary" onclick={() => attempt++}>I've installed it, check again</button>
      </div>
    {:else if phase === 'need-model'}
      <h2>One-time download: the reading model</h2>
      <p>About 2 GB. It is saved on this computer and only needs downloading once.</p>
      <div class="setup-actions">
        <button class="setup-button" onclick={download}>Download the model</button>
      </div>
    {:else if phase === 'downloading'}
      <h2>Downloading the reading model{percent === null ? '…' : ` · ${percent}%`}</h2>
      <p>{progress?.status ?? 'Starting the download…'}</p>
      <div class="progress" class:indeterminate={percent === null} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? undefined}>
        <div style:width={percent === null ? undefined : `${percent}%`}></div>
      </div>
    {:else if phase === 'error'}
      <h2>The reading model isn't ready</h2>
      <p>{detail}</p>
      <div class="setup-actions">
        <button class="setup-button" onclick={() => attempt++}>Try again</button>
      </div>
    {/if}
  </section>
{/if}
