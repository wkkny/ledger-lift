<script lang="ts">
  import { untrack } from 'svelte';
  import { errorText, getStatus, openDownloadPage, pullModel, startOllama, warmModel } from './api';
  import type { PullProgress, SetupPhase } from '@shared/types';
  import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Download from '@lucide/svelte/icons/download';
  import Loader from '@lucide/svelte/icons/loader-circle';

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

{#if phase === 'missing-ollama' || phase === 'need-model' || phase === 'downloading' || phase === 'error'}
  <Alert class="setup border-border/80 bg-card px-4 py-3.5 shadow-[0_1px_0_var(--surface-tint)]" variant={phase === 'error' ? 'destructive' : 'default'} aria-live="polite">
    {#if phase === 'missing-ollama'}
      <Download aria-hidden="true" />
      <AlertTitle>Install Ollama to read pages on this computer</AlertTitle>
      <AlertDescription>
        <p>Ollama runs the reading model locally, so your ledger photos never leave this computer. Install it, then come back here.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onclick={openDownloadPage}>Download Ollama</Button>
          <Button size="sm" variant="outline" onclick={() => attempt++}>I've installed it, check again</Button>
        </div>
      </AlertDescription>
    {:else if phase === 'need-model'}
      <Download aria-hidden="true" />
      <AlertTitle>One-time download: the reading model</AlertTitle>
      <AlertDescription>
        <p>About 2&nbsp;GB. It is saved on this computer and only needs downloading once.</p>
        <div class="mt-3"><Button size="sm" onclick={download}>Download the model</Button></div>
      </AlertDescription>
    {:else if phase === 'downloading'}
      <Loader class="animate-spin" aria-hidden="true" />
      <AlertTitle>Downloading the reading model{percent === null ? '…' : ` · ${percent}%`}</AlertTitle>
      <AlertDescription>
        <p>{progress?.status ?? 'Starting the download…'}</p>
        <Progress class="mt-3 {percent === null ? 'animate-pulse' : ''}" value={percent ?? 100} aria-label="Model download progress" />
      </AlertDescription>
    {:else if phase === 'error'}
      <CircleAlert aria-hidden="true" />
      <AlertTitle>The reading model isn't ready</AlertTitle>
      <AlertDescription>
        <p>{detail}</p>
        <div class="mt-3"><Button size="sm" variant="outline" onclick={() => attempt++}>Try again</Button></div>
      </AlertDescription>
    {/if}
  </Alert>
{/if}
