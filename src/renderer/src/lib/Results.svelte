<script lang="ts">
  import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Checkbox } from '$lib/components/ui/checkbox/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table/index.js';
  import { cn } from '$lib/utils.js';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Download from '@lucide/svelte/icons/download';
  import Info from '@lucide/svelte/icons/info';
  import Loader from '@lucide/svelte/icons/loader-circle';
  import { FIELDS, canDownload, editField, isUncertain, needsAttention, reviewSummary, unreviewedCount, type Row } from './review';

  let { rows = $bindable(), reading, saving, notice, onsave, onrestart }: {
    rows: Row[];
    reading: boolean;
    saving: boolean;
    notice: string;
    onsave: () => void;
    onrestart: () => void;
  } = $props();

  const remaining = $derived(unreviewedCount(rows));
</script>

<section id="results" class="bg-card ring-border/80 space-y-5 rounded-xl p-5 shadow-[0_1px_0_var(--surface-tint)] ring-1 sm:p-6" aria-labelledby="results-heading">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="space-y-1">
      <h2 id="results-heading" class="text-base font-semibold tracking-tight">Review the entries</h2>
      <p class="text-muted-foreground text-sm">Fix anything the model misread before export.</p>
    </div>
    <Badge variant="secondary" class="entry-count tabular-nums">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</Badge>
  </div>

  <Alert class="border-border/70 bg-muted/40">
    <Info aria-hidden="true" />
    <AlertDescription>
      Handwriting can be tricky. Entries highlighted in amber need extra attention. Mark every row reviewed to enable the CSV download.
    </AlertDescription>
  </Alert>

  <div class="overflow-x-auto rounded-lg ring-1 ring-border/70">
    <Table>
      <TableHeader>
        <TableRow class="hover:bg-transparent">
          {#each FIELDS as { label }}<TableHead class="bg-muted/50 px-3.5 text-xs tracking-wide uppercase">{label}</TableHead>{/each}
          <TableHead class="bg-muted/50 w-28 px-3.5 text-xs tracking-wide uppercase">Review</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each rows as row, index (row.id)}
          <TableRow class={cn('entry-row', needsAttention(row) && 'needs-review', row.reviewed && 'reviewed bg-muted/30')}>
            {#each FIELDS as { key, label }}
              <TableCell class="p-1">
                <Input
                  value={row[key]}
                  placeholder="{label}…"
                  aria-label="{label}, row {index + 1}"
                  autocomplete="off"
                  class={cn(
                    'h-8 border-transparent bg-transparent shadow-none dark:bg-transparent',
                    isUncertain(row, key) && 'uncertain border-amber-500/70 bg-amber-100/50 dark:border-amber-500/50 dark:bg-amber-400/10'
                  )}
                  oninput={(event) => editField(row, key, event.currentTarget.value)}
                />
              </TableCell>
            {/each}
            <TableCell class="row-status">
              <label class="flex min-h-8 cursor-pointer items-center gap-2 text-xs">
                <Checkbox class="review-checkbox" aria-label="Mark row {index + 1} reviewed" bind:checked={row.reviewed} />
                Reviewed
              </label>
            </TableCell>
          </TableRow>
        {:else}
          {#if !reading}
            <TableRow class="hover:bg-transparent">
              <TableCell colspan={5} class="text-muted-foreground px-3.5 py-8 text-center text-sm">No entries yet.</TableCell>
            </TableRow>
          {/if}
        {/each}
        {#if reading}
          <TableRow class="reading-row hover:bg-transparent">
            <TableCell colspan={5} class="text-muted-foreground px-3.5 text-xs">
              <Loader class="mr-1.5 inline size-3.5 animate-spin" aria-hidden="true" />Reading…
            </TableCell>
          </TableRow>
        {/if}
      </TableBody>
    </Table>
  </div>

  <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
    <span class="text-muted-foreground text-sm">{reviewSummary(remaining, reading)}</span>
    <Button class="download-button transition-[background-color,transform,opacity] duration-200" disabled={!canDownload(rows, reading) || saving} onclick={onsave}>
      <Download aria-hidden="true" />{saving ? 'Saving…' : 'Download CSV'}
    </Button>
    {#if notice}<p class="notice text-muted-foreground w-full text-xs [overflow-wrap:anywhere]" role="status" aria-live="polite">{notice}</p>{/if}
  </div>
</section>

<Button variant="ghost" size="sm" class="start-over text-muted-foreground -mt-2" onclick={onrestart}>
  <ArrowLeft aria-hidden="true" />Start with another page
</Button>
