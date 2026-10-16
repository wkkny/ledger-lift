<script lang="ts">
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

<section class="results" id="results">
  <div class="results-heading">
    <div class="step-heading compact">
      <span class="step-number">02</span>
      <div><h2>Review the entries</h2><p>Fix anything the model misread before export.</p></div>
    </div>
    <span class="entry-count">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
  </div>
  <div class="review-note"><span>✳</span><p><strong>Take a quick look.</strong> Handwriting can be tricky. Entries highlighted in amber need extra attention. Mark every row reviewed to enable the CSV download.</p></div>
  <div class="table-scroll">
    <table>
      <thead><tr>{#each FIELDS as { label }}<th>{label}</th>{/each}<th>Review</th></tr></thead>
      <tbody>
        {#each rows as row, index (row.id)}
          <tr class="entry-row" class:needs-review={needsAttention(row)} class:reviewed={row.reviewed}>
            {#each FIELDS as { key, label }}
              <td>
                <input
                  value={row[key]}
                  placeholder={label}
                  aria-label="{label}, row {index + 1}"
                  class:uncertain={isUncertain(row, key)}
                  oninput={(event) => editField(row, key, event.currentTarget.value)}
                />
              </td>
            {/each}
            <td class="row-status">
              <label class="review-control">
                <input type="checkbox" class="review-checkbox" aria-label="Mark row {index + 1} reviewed" bind:checked={row.reviewed} />
                <span>Reviewed</span>
              </label>
            </td>
          </tr>
        {/each}
        {#if reading}
          <tr class="reading-row"><td colspan="5">Reading…</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
  <div class="results-footer">
    <span>{reviewSummary(remaining, reading)}</span>
    <button class="download-button" disabled={!canDownload(rows, reading) || saving} onclick={onsave}>
      <span>{saving ? 'Saving…' : 'Download CSV'}</span><span aria-hidden="true">↓</span>
    </button>
  </div>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  <button class="start-over" onclick={onrestart}>← Start with another page</button>
</section>
