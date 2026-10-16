<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { cancelExtract, defaultModel, errorText, extractEntries, saveCsv } from './lib/api';
  import { prepareImage } from './lib/image';
  import { toCsvEntries, toRow, type Row } from './lib/review';
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
  const statusClass = $derived(ready ? 'online' : phase === 'checking' || phase === 'starting' || phase === 'downloading' ? '' : 'offline');
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

<header class="topbar">
  <a class="brand" href="/" aria-label="Ledger Lift home"><span class="brand-mark">L</span> ledger lift</a>
  <div class="local-status"><span class="status-dot {statusClass}"></span><span>{statusText}</span></div>
</header>

<main>
  <section class="intro">
    <div class="eyebrow"><span class="eyebrow-line"></span> PAPER RECORDS, READY TO USE</div>
    <h1>Give your ledger<br /><em>a fresh start.</em></h1>
    <p class="intro-copy">Turn one photo of a handwritten sales page into a spreadsheet you can actually work with. Your ledger stays on this computer.</p>
  </section>

  {#if committedModel}
    <Setup model={committedModel} bind:phase />
  {/if}

  <section class="workspace" aria-label="Ledger extraction">
    <div class="step-heading"><span class="step-number">01</span><div><h2>Add a ledger page</h2><p>A clear, well-lit photo works best.</p></div></div>

    <Uploader {file} onchoose={(chosen) => { file = chosen; message = ''; }} onclear={() => (file = null)} onreject={(text) => (message = text)} />

    <details class="advanced">
      <summary>Advanced: reading model</summary>
      <div class="model-row">
        <label for="model-name">Local vision model</label>
        <div class="model-control">
          <input id="model-name" bind:value={model} onchange={() => (committedModel = model.trim())} autocomplete="off" spellcheck="false" />
          <span class="model-local">ON THIS DEVICE</span>
        </div>
        <p>Any Ollama vision model. Models that think before answering are much slower.</p>
      </div>
    </details>

    <button class="primary-button" disabled={!file || !ready || reading} onclick={read}>
      <span>{reading ? `Reading page… ${elapsed}s` : 'Read this page'}</span><span aria-hidden="true">↗</span>
    </button>
    {#if reading}<button class="stop-button" onclick={cancelExtract}>Stop</button>{/if}
    <p class="message" role="status" aria-live="polite">{message}</p>
  </section>

  {#if showResults}
    <Results bind:rows {reading} {saving} {notice} onsave={save} onrestart={restart} />
  {/if}

  <aside class="privacy"><span class="privacy-icon">⌂</span><div><strong>Your records stay yours.</strong><p>Images are processed by Ollama on your computer. Ledger Lift doesn’t send them anywhere else.</p></div></aside>
</main>

<footer><span>LEDGER LIFT</span><span>Made for the books you keep by hand.</span></footer>
