// PROTOTYPE (throwaway): small pieces the layout variants share. The layouts themselves are not shared.
import { LoaderCircle, RotateCcw, RotateCw, Upload, X } from 'lucide-react'
import { useEffect, useState, type DragEvent } from 'react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FIELDS, editField, isUncertain, needsAttention, type FieldKey, type Row } from '@/lib/review'
import { cn } from '@/lib/utils'
import type { Ctx } from './context'

export function usePreviewUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) return setUrl(null)
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-border/70 bg-card/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-[0.95rem] font-semibold tracking-tight">Ledger Lift</span>
        </div>
        {children}
      </div>
    </header>
  )
}

export function ModelSelect({ ctx }: { ctx: Ctx }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Model</span>
      <select className="border-input bg-background h-8 rounded-lg border px-2 font-mono text-xs" value={ctx.model} onChange={(event) => ctx.setModel(event.target.value)}>
        {ctx.models.map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>
  )
}

/** A photo area that fills its box: a drop zone until a photo is chosen, then the whole page with turn buttons. */
export function BigPhoto({ ctx, className }: { ctx: Ctx; className?: string }) {
  const url = usePreviewUrl(ctx.file)
  const [dragging, setDragging] = useState(false)
  const choose = (candidate?: File) => {
    if (!candidate) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type)) return ctx.onReject('Choose a JPEG, PNG, or WebP image.')
    ctx.onChoose(candidate)
  }
  const over = (event: DragEvent) => {
    event.preventDefault()
    setDragging(true)
  }
  const stay = (event: React.MouseEvent, action: () => void) => {
    event.preventDefault()
    event.stopPropagation()
    action()
  }
  return (
    <label
      className={cn('border-input bg-muted/40 hover:bg-muted/60 relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed', dragging && 'border-ring', className)}
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        choose(event.dataTransfer.files[0])
      }}
    >
      <input
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          choose(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      {url ? (
        <>
          <img src={url} alt="Selected ledger page" className="size-full object-contain p-2 transition-transform duration-200" style={{ transform: `rotate(${ctx.turns * 90}deg)` }} />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <Button variant="secondary" size="icon-sm" aria-label="Turn the photo left" onClick={(event) => stay(event, () => ctx.onTurn(-1))}><RotateCcw /></Button>
            <Button variant="secondary" size="icon-sm" aria-label="Turn the photo right" onClick={(event) => stay(event, () => ctx.onTurn(1))}><RotateCw /></Button>
            <Button variant="secondary" size="icon-sm" aria-label="Remove selected image" onClick={(event) => stay(event, ctx.onClear)}><X /></Button>
          </div>
        </>
      ) : (
        <span className="text-muted-foreground flex flex-col items-center gap-2 p-6 text-center text-sm">
          <span className="bg-background ring-border/70 grid size-10 place-items-center rounded-lg ring-1"><Upload className="size-4" /></span>
          <span>Drop a photo of a ledger page, or <strong className="text-foreground font-medium underline underline-offset-4">choose a file</strong></span>
          <span className="text-xs">JPG, PNG or WebP</span>
        </span>
      )}
    </label>
  )
}

const MIN_WIDTH: Record<FieldKey, string> = { date: 'min-w-32', item: 'min-w-36', quantity: 'min-w-20', amount: 'min-w-20' }

export function RowsTable({ ctx }: { ctx: Ctx }) {
  const { rows, setRows, reading } = ctx
  const update = (id: number, change: (row: Row) => Row) => setRows(rows.map((row) => (row.id === id ? change(row) : row)))
  return (
    <div className="ring-border/70 overflow-x-auto rounded-lg ring-1">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {FIELDS.map(({ key, label }) => <TableHead key={key} className="bg-muted/50 px-3.5 text-xs tracking-wide uppercase">{label}</TableHead>)}
            <TableHead className="bg-muted/50 w-28 px-3.5 text-xs tracking-wide uppercase">Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id} className={cn(needsAttention(row) && 'needs-review', row.reviewed && 'bg-muted/30')}>
              {FIELDS.map(({ key, label }) => (
                <TableCell key={key} className="p-1">
                  <Input
                    value={row[key]}
                    placeholder={`${label}…`}
                    aria-label={`${label}, row ${index + 1}`}
                    className={cn(MIN_WIDTH[key], 'h-8 border-transparent bg-transparent shadow-none dark:bg-transparent', isUncertain(row, key) && 'border-amber-500/70 bg-amber-100/50 dark:bg-amber-400/10')}
                    onChange={(event) => update(row.id, (current) => editField(current, key, event.target.value))}
                  />
                </TableCell>
              ))}
              <TableCell>
                <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs">
                  <Checkbox aria-label={`Mark row ${index + 1} reviewed`} checked={row.reviewed} onCheckedChange={(checked) => update(row.id, (current) => ({ ...current, reviewed: checked === true }))} />
                  Reviewed
                </label>
              </TableCell>
            </TableRow>
          ))}
          {reading && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="text-muted-foreground px-3.5 text-xs">
                <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin" />Reading…
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
