<script lang="ts">
  let { file, onchoose, onclear, onreject }: {
    file: File | null;
    onchoose: (file: File) => void;
    onclear: () => void;
    onreject: (message: string) => void;
  } = $props();

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_BYTES = 50 * 1024 * 1024;

  let dragging = $state(false);
  let previewUrl = $state<string | null>(null);

  $effect(() => {
    if (!file) {
      previewUrl = null;
      return;
    }
    const url = URL.createObjectURL(file);
    previewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  function choose(candidate: File | undefined) {
    if (!candidate) return;
    if (!ALLOWED.includes(candidate.type)) return onreject('Choose a JPEG, PNG, or WebP image.');
    if (candidate.size > MAX_BYTES) return onreject('This image is over 50 MB. Choose a smaller photo.');
    onchoose(candidate);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    choose(event.dataTransfer?.files[0]);
  }
</script>

<div
  role="presentation"
  ondragenter={(event) => { event.preventDefault(); dragging = true; }}
  ondragover={(event) => { event.preventDefault(); dragging = true; }}
  ondragleave={(event) => { event.preventDefault(); dragging = false; }}
  ondrop={drop}
>
  <label class="upload-zone" class:has-image={!!file} class:drag-over={dragging}>
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      hidden
      onchange={(event) => {
        choose(event.currentTarget.files?.[0]);
        event.currentTarget.value = '';
      }}
    />
    <span class="upload-icon" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 27V7m0 0-7 7m7-7 7 7M8 23v9a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2v-9" /></svg></span>
    <span class="upload-title">Drop a photo here, or <strong>choose a file</strong></span>
    <span class="upload-hint">JPG, PNG or WebP · one page at a time</span>
    {#if file && previewUrl}
      <div class="preview-wrap">
        <img src={previewUrl} alt="Selected ledger page" />
        <span>{file.name}</span>
        <button
          type="button"
          class="remove-image"
          aria-label="Remove selected image"
          onclick={(event) => { event.preventDefault(); event.stopPropagation(); onclear(); }}
        >×</button>
      </div>
    {/if}
  </label>
</div>
