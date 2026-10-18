import { RotateCcw, RotateCw, Upload, X } from 'lucide-react'
import { useEffect, useState, type DragEvent, type MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  file: File | null
  /** Quarter turns clockwise to show the photo turned, and the owner's request to turn it a quarter (+1 right, -1 left). */
  turns: number
  onTurn: (step: number) => void
  onChoose: (file: File) => void
  onClear: () => void
  onReject: (message: string) => void
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 50 * 1024 * 1024

export function Uploader({ file, turns, onTurn, onChoose, onClear, onReject }: Props) {
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

  /** The buttons sit inside the file picker's label, so a click must not also open the picker. */
  function stay(event: MouseEvent, action: () => void) {
    event.preventDefault()
    event.stopPropagation()
    action()
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
            <img
              src={previewUrl}
              alt="Selected ledger page"
              width={240}
              height={160}
              className="ring-border/80 max-h-full max-w-[60%] rounded-md object-contain ring-1 transition-transform duration-200"
              // On its side the preview's width must fit the box's height.
              style={{ transform: `rotate(${turns * 90}deg)`, ...(turns % 2 === 1 ? { maxHeight: 'none', maxWidth: '8.5rem' } : {}) }}
            />
            <span className="text-muted-foreground max-w-32 truncate text-xs" title={file.name}>{file.name}</span>
            <div className="absolute top-2 right-2 flex gap-1.5">
              <Button type="button" variant="secondary" size="icon-sm" className="rotate-left" aria-label="Turn the photo left" title="Turn the photo left" onClick={(event) => stay(event, () => onTurn(-1))}>
                <RotateCcw aria-hidden="true" />
              </Button>
              <Button type="button" variant="secondary" size="icon-sm" className="rotate-right" aria-label="Turn the photo right" title="Turn the photo right" onClick={(event) => stay(event, () => onTurn(1))}>
                <RotateCw aria-hidden="true" />
              </Button>
              <Button type="button" variant="secondary" size="icon-sm" aria-label="Remove selected image" onClick={(event) => stay(event, onClear)}>
                <X aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </label>
    </div>
  )
}
