<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { cancelExtract, defaultModel, errorText, extractEntries, getStatus, saveCsv } from './lib/api';
  import { prepareImage } from './lib/image';
  import { toCsvEntries, toRow, type Row } from './lib/review';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Collapsible from '$lib/components/ui/collapsible/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import Check from '@lucide/svelte/icons/check';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Loader from '@lucide/svelte/icons/loader-circle';
  import ScanText from '@lucide/svelte/icons/scan-text';
  import Results from './lib/Results.svelte';
  import Setup from './lib/Setup.svelte';
  import Uploader from './lib/Uploader.svelte';
  import type { SetupPhase } from '@shared/types';

  let model = $state('');
  let committedModel = $state('');
  let phase = $state<SetupPhase>('checking');
  let file = $state<File | null>(null);
  let rows = $state<Row[]>([]);
  let showResults = $state(false);
  let reading = $state(false);
  let elapsed = $state(0);
  let saving = $state(false);
  let message = $state('');
  let notice = $state('');
  let modelMenuOpen = $state(false);
  let availableModels = $state<string[]>([]);

  const ready = $derived(phase === 'ready');

  onMount(async () => {
    model = committedModel = await defaultModel();
    availableModels = [model];
    void refreshModels(model);
  });

  $effect(() => {
    const name = committedModel;
    void phase;
    if (!name) return;
    untrack(() => {
      if (!availableModels.includes(name)) availableModels = [name, ...availableModels];
      void refreshModels(name);
    });
  });

  $effect(() => {
    if (!reading) return;
    elapsed = 0;
    const timer = setInterval(() => (elapsed += 1), 1000);
    return () => clearInterval(timer);
  });

  async function refreshModels(name: string) {
    try {
      const status = await getStatus(name);
      const names = status.models.length > 0 ? status.models : [name];
      availableModels = names.includes(name) ? names : [name, ...names];
    } catch {
      availableModels = [name];
    }
  }

  function chooseModel(name: string) {
    model = committedModel = name.trim();
    modelMenuOpen = false;
  }

  async function read() {
    if (!file) return;
    rows = [];
    message = notice = '';
    reading = true;
    showResults = true;
    await tick();
    document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const image = await prepareImage(file);
      const outcome = await extractEntries(image, model.trim(), (entry) => rows.push(toRow(entry)));
      if (outcome.cancelled) message = `Stopped. ${outcome.count} ${outcome.count === 1 ? 'row was' : 'rows were'} read before you stopped.`;
    } catch (error) {
      message = errorText(error);
      if (rows.length === 0) showResults = false;
    } finally {
      reading = false;
    }
  }

  async function save() {
    saving = true;
    message = notice = '';
    try {
      const path = await saveCsv(toCsvEntries(rows), `ledger-entries-${new Date().toISOString().slice(0, 10)}.csv`);
      if (path) notice = `Saved to ${path}`;
    } catch (error) {
      message = errorText(error);
    } finally {
      saving = false;
    }
  }

  function restart() {
    rows = [];
    showResults = false;
    file = null;
    message = notice = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>

<a href="#main" class="skip-link">Skip to content</a>

<header class="border-border/70 bg-card/80 sticky top-0 z-40 border-b backdrop-blur-md">
  <div class="mx-auto flex h-14 max-w-2xl items-center px-5 sm:px-6">
    <div class="flex items-center gap-2.5">
      <span class="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-sm font-semibold tracking-tight" aria-hidden="true">L</span>
      <span class="text-[0.95rem] font-semibold tracking-tight">Ledger Lift</span>
    </div>
  </div>
</header>

<main id="main" class="mx-auto max-w-2xl space-y-6 px-5 py-6 sm:px-6 sm:py-8" data-setup-phase={phase}>
  {#if committedModel}
    <Setup model={committedModel} bind:phase />
  {/if}

  <section class="bg-card ring-border/80 space-y-5 rounded-xl p-5 shadow-[0_1px_0_var(--surface-tint)] ring-1 sm:p-6" aria-label="Ledger extraction">
    <h1 class="text-base font-semibold tracking-tight">Add a ledger page</h1>

    <Uploader {file} onchoose={(chosen) => { file = chosen; message = ''; }} onclear={() => (file = null)} onreject={(text) => (message = text)} />

    <div class="space-y-1.5">
      <Label for="model-trigger">Model</Label>
      <Collapsible.Root
        bind:open={modelMenuOpen}
        onOpenChange={(open) => {
          if (open && committedModel) void refreshModels(committedModel);
        }}
      >
        <Collapsible.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              id="model-trigger"
              type="button"
              class="border-input bg-background hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left outline-none transition-[background-color,border-color] duration-200 focus-visible:ring-3"
              aria-label="Reading model"
            >
              <span class="min-w-0 flex-1 truncate font-mono text-xs">{model || 'Choose a model'}</span>
              {#if modelMenuOpen}
                <ChevronUp class="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              {:else}
                <ChevronsUpDown class="text-muted-foreground size-3.5 shrink-0 opacity-70" aria-hidden="true" />
              {/if}
            </button>
          {/snippet}
        </Collapsible.Trigger>
        <Collapsible.Content class="pt-1.5">
          <ul class="border-input bg-background max-h-48 overflow-y-auto rounded-lg border py-1" role="listbox" aria-label="Installed models">
            {#each availableModels as name (name)}
              <li role="option" aria-selected={name === model}>
                <button
                  type="button"
                  class="hover:bg-muted flex w-full items-center gap-2 px-2.5 py-2 text-left font-mono text-xs transition-colors {name === model ? 'bg-muted' : ''}"
                  onclick={() => chooseModel(name)}
                >
                  <Check class="size-3.5 shrink-0 {name === model ? 'opacity-100' : 'opacity-0'}" aria-hidden="true" />
                  <span class="min-w-0 truncate">{name}</span>
                </button>
              </li>
            {:else}
              <li class="text-muted-foreground px-2.5 py-2 text-xs">No models found yet.</li>
            {/each}
          </ul>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <div class="flex flex-col items-stretch gap-2 pt-1">
      <Button size="lg" class="primary-button h-11 w-full transition-[background-color,transform,opacity] duration-200" disabled={!file || !ready || reading} onclick={read}>
        {#if reading}
          <Loader class="animate-spin" aria-hidden="true" />
        {:else}
          <ScanText aria-hidden="true" />
        {/if}
        {reading ? `Reading page… ${elapsed}s` : 'Read this page'}
      </Button>
      {#if reading}
        <Button variant="link" size="sm" class="stop-button text-destructive mx-auto h-8" onclick={cancelExtract}>Stop</Button>
      {/if}
      <p class="message text-destructive text-sm empty:hidden" role="status" aria-live="polite">{message}</p>
    </div>
  </section>

  {#if showResults}
    <Results bind:rows {reading} {saving} {notice} onsave={save} onrestart={restart} />
  {/if}
</main>
