<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { cancelExtract, defaultModel, errorText, extractEntries, saveCsv } from './lib/api';
  import { prepareImage } from './lib/image';
  import { toCsvEntries, toRow, type Row } from './lib/review';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Collapsible from '$lib/components/ui/collapsible/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Loader from '@lucide/svelte/icons/loader-circle';
  import Lock from '@lucide/svelte/icons/lock';
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

  const ready = $derived(phase === 'ready');
  const statusDot = $derived(
    ready ? 'bg-emerald-500' : phase === 'checking' || phase === 'starting' || phase === 'downloading' ? 'bg-amber-400' : 'bg-red-500',
  );
  const statusText = $derived(
    ready ? 'Local model ready' : phase === 'checking' ? 'Checking local model…' : phase === 'starting' ? 'Starting Ollama…' : phase === 'downloading' ? 'Downloading model…' : 'Setup needed',
  );

  onMount(async () => {
    model = committedModel = await defaultModel();
  });

  $effect(() => {
    if (!reading) return;
    elapsed = 0;
    const timer = setInterval(() => (elapsed += 1), 1000);
    return () => clearInterval(timer);
  });

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

<header class="border-b">
  <div class="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
    <div class="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
      <span class="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg font-serif text-base">L</span>
      Ledger Lift
    </div>
    <Badge variant="outline" class="local-status gap-2 font-normal">
      <span class="size-1.5 rounded-full {statusDot}"></span>{statusText}
    </Badge>
  </div>
</header>

<main class="mx-auto max-w-3xl space-y-6 px-6 py-10">
  <section class="space-y-2">
    <h1 class="text-3xl font-semibold tracking-tight">Turn a ledger page into rows you can use</h1>
    <p class="text-muted-foreground max-w-xl text-sm leading-relaxed">
      Add one photo of a handwritten sales page and get a spreadsheet you can work with. Your ledger stays on this computer.
    </p>
  </section>

  {#if committedModel}
    <Setup model={committedModel} bind:phase />
  {/if}

  <Card.Root aria-label="Ledger extraction">
    <Card.Header>
      <Card.Title>Add a ledger page</Card.Title>
      <Card.Description>A clear, well-lit photo works best.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4">
      <Uploader {file} onchoose={(chosen) => { file = chosen; message = ''; }} onclear={() => (file = null)} onreject={(text) => (message = text)} />

      <Collapsible.Root>
        <Collapsible.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="sm" class="text-muted-foreground -ml-2.5">
              Advanced: reading model <ChevronDown />
            </Button>
          {/snippet}
        </Collapsible.Trigger>
        <Collapsible.Content class="space-y-2 pt-2">
          <Label for="model-name">Local vision model</Label>
          <Input id="model-name" bind:value={model} onchange={() => (committedModel = model.trim())} autocomplete="off" spellcheck={false} class="font-mono text-xs" />
          <p class="text-muted-foreground text-xs">Any Ollama vision model. Models that think before answering are much slower.</p>
        </Collapsible.Content>
      </Collapsible.Root>
    </Card.Content>
    <Card.Footer class="flex-col items-stretch gap-2">
      <Button size="lg" class="primary-button h-10 w-full" disabled={!file || !ready || reading} onclick={read}>
        {#if reading}<Loader class="animate-spin" />{:else}<ScanText />{/if}
        {reading ? `Reading page… ${elapsed}s` : 'Read this page'}
      </Button>
      {#if reading}
        <Button variant="link" size="sm" class="stop-button text-destructive mx-auto" onclick={cancelExtract}>Stop</Button>
      {/if}
      <p class="message text-destructive text-sm empty:hidden" role="status" aria-live="polite">{message}</p>
    </Card.Footer>
  </Card.Root>

  {#if showResults}
    <Results bind:rows {reading} {saving} {notice} onsave={save} onrestart={restart} />
  {/if}

  <p class="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
    <Lock class="mt-0.5 size-3.5 shrink-0" />
    <span><strong class="text-foreground font-medium">Your records stay yours.</strong> Images are processed by Ollama on your computer. Ledger Lift doesn’t send them anywhere else.</span>
  </p>
</main>
