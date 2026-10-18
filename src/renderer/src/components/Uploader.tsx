import { Upload, X } from 'lucide-react'
import { useEffect, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  file: File | null
  onChoose: (file: File) => void
  onClear: () => void
  onReject: (message: string) => void
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 50 * 1024 * 1024

export function Uploader({ file, onChoose, onClear, onReject }: Props) {
  const [dragging, setDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return setPreviewUrl(null)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function choose(candidate: File | undefined) {
    if (!candidate) return
    if (!ALLOWED.includes(candidate.type)) return onReject('Choose a JPEG, PNG, or WebP image.')
    if (candidate.size > MAX_BYTES) return onReject('This image is over 50 MB. Choose a smaller photo.')
    onChoose(candidate)
  }

  const over = (event: DragEvent) => {
    event.preventDefault()
    setDragging(true)
  }

  return (
    <div
      role="presentation"
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        choose(event.dataTransfer.files[0])
      }}
    >
      <label
        className={cn(
          'upload-zone border-input bg-muted/40 hover:bg-muted/70 relative flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-dashed px-4 text-center transition-[background-color,border-color] duration-200',
          'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-3',
          dragging && 'border-ring bg-muted/70'
        )}
      >
        {/* Visually hidden rather than `hidden`, so the picker stays reachable with Tab and Enter or Space. */}
        <input
          className="visually-hidden sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            choose(event.currentTarget.files?.[0])
            event.currentTarget.value = ''
          }}
        />
        <span className="bg-background text-muted-foreground ring-border/70 mb-1 grid size-9 place-items-center rounded-md ring-1" aria-hidden="true">
          <Upload className="size-4" />
        </span>
        <span className="text-sm">Drop a photo here, or <strong className="font-medium underline underline-offset-4">choose a file</strong></span>
        <span className="text-muted-foreground text-xs">JPG, PNG or WebP · one page at a time</span>
        {file && previewUrl && (
          <div className="preview-wrap bg-card absolute inset-0 flex items-center justify-center gap-4 p-3">
            <img src={previewUrl} alt="Selected ledger page" width={240} height={160} className="ring-border/80 max-h-full max-w-[60%] rounded-md object-contain ring-1" />
            <span className="text-muted-foreground max-w-32 truncate text-xs" title={file.name}>{file.name}</span>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-2 right-2"
              aria-label="Remove selected image"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onClear()
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
      </label>
    </div>
  )
}
