<script lang="ts">
  import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
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

<Card.Root id="results">
  <Card.Header>
    <Card.Title>Review the entries</Card.Title>
    <Card.Description>Fix anything the model misread before export.</Card.Description>
    <Card.Action><Badge variant="secondary" class="entry-count">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</Badge></Card.Action>
  </Card.Header>
  <Card.Content class="space-y-4">
    <Alert>
      <Info />
      <AlertDescription>
        Handwriting can be tricky. Entries highlighted in amber need extra attention. Mark every row reviewed to enable the CSV download.
      </AlertDescription>
    </Alert>
    <Table>
      <TableHeader>
        <TableRow>
          {#each FIELDS as { label }}<TableHead class="px-3.5">{label}</TableHead>{/each}
          <TableHead class="w-28 px-3.5">Review</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each rows as row, index (row.id)}
          <TableRow class={cn('entry-row', needsAttention(row) && 'needs-review', row.reviewed && 'reviewed bg-muted/40')}>
            {#each FIELDS as { key, label }}
              <TableCell class="p-1">
                <Input
                  value={row[key]}
                  placeholder={label}
                  aria-label="{label}, row {index + 1}"
                  class={cn(
                    'h-8 border-transparent bg-transparent shadow-none dark:bg-transparent',
                    isUncertain(row, key) && 'uncertain border-amber-400 bg-amber-100/60 dark:border-amber-500/60 dark:bg-amber-400/10'
                  )}
                  oninput={(event) => editField(row, key, event.currentTarget.value)}
                />
              </TableCell>
            {/each}
            <TableCell class="row-status">
              <label class="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox class="review-checkbox" aria-label="Mark row {index + 1} reviewed" bind:checked={row.reviewed} />
                Reviewed
              </label>
            </TableCell>
          </TableRow>
        {/each}
        {#if reading}
          <TableRow class="reading-row hover:bg-transparent">
            <TableCell colspan={5} class="text-muted-foreground text-xs"><Loader class="mr-1.5 inline size-3.5 animate-spin" />Reading…</TableCell>
          </TableRow>
        {/if}
      </TableBody>
    </Table>
  </Card.Content>
  <Card.Footer class="flex-wrap justify-between gap-3">
    <span class="text-muted-foreground text-sm">{reviewSummary(remaining, reading)}</span>
    <Button class="download-button" disabled={!canDownload(rows, reading) || saving} onclick={onsave}>
      <Download />{saving ? 'Saving…' : 'Download CSV'}
    </Button>
    {#if notice}<p class="notice text-muted-foreground w-full text-xs [overflow-wrap:anywhere]" role="status">{notice}</p>{/if}
  </Card.Footer>
</Card.Root>
<Button variant="ghost" size="sm" class="start-over -mt-2" onclick={onrestart}><ArrowLeft />Start with another page</Button>
