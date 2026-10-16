<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import Upload from '@lucide/svelte/icons/upload';
  import X from '@lucide/svelte/icons/x';

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
  <label
    class={cn(
      'upload-zone border-input bg-muted/30 hover:bg-muted/60 relative flex min-h-44 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-dashed px-4 text-center transition-colors',
      'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-3',
      dragging && 'border-ring bg-muted/60'
    )}
  >
    <!-- Visually hidden rather than `hidden`, so the picker stays reachable with Tab and Enter or Space. -->
    <input
      class="visually-hidden sr-only"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onchange={(event) => {
        choose(event.currentTarget.files?.[0]);
        event.currentTarget.value = '';
      }}
    />
    <span class="bg-muted text-muted-foreground mb-1 grid size-10 place-items-center rounded-lg"><Upload class="size-5" /></span>
    <span class="text-sm">Drop a photo here, or <strong class="font-medium underline underline-offset-4">choose a file</strong></span>
    <span class="text-muted-foreground text-xs">JPG, PNG or WebP · one page at a time</span>
    {#if file && previewUrl}
      <div class="preview-wrap bg-card absolute inset-0 flex items-center justify-center gap-4 p-3">
        <img src={previewUrl} alt="Selected ledger page" class="max-h-full max-w-[60%] rounded-md border object-contain" />
        <span class="text-muted-foreground max-w-32 text-xs [overflow-wrap:anywhere]">{file.name}</span>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          class="absolute top-2 right-2"
          aria-label="Remove selected image"
          onclick={(event) => { event.preventDefault(); event.stopPropagation(); onclear(); }}
        >
          <X />
        </Button>
      </div>
    {/if}
  </label>
</div>
