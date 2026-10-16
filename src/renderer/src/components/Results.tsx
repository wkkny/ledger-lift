import { ArrowLeft, Download, Info, LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FIELDS, canDownload, editField, isUncertain, needsAttention, reviewSummary, unreviewedCount, type Row } from '@/lib/review'
import { cn } from '@/lib/utils'

type Props = {
  rows: Row[]
  onRows: (rows: Row[]) => void
  reading: boolean
  saving: boolean
  notice: string
  onSave: () => void
  onRestart: () => void
}

export function Results({ rows, onRows, reading, saving, notice, onSave, onRestart }: Props) {
  const remaining = unreviewedCount(rows)
  const update = (id: number, change: (row: Row) => Row) => onRows(rows.map((row) => (row.id === id ? change(row) : row)))

  return (
    <>
      <section id="results" className="bg-card ring-border/80 space-y-5 rounded-xl p-5 shadow-[0_1px_0_var(--surface-tint)] ring-1 sm:p-6" aria-labelledby="results-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="results-heading" className="text-base font-semibold tracking-tight">Review the entries</h2>
            <p className="text-muted-foreground text-sm">Fix anything the model misread before export.</p>
          </div>
          <Badge variant="secondary" className="entry-count tabular-nums">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</Badge>
        </div>

        <Alert className="border-border/70 bg-muted/40">
          <Info aria-hidden="true" />
          <AlertDescription>
            Handwriting can be tricky. Entries highlighted in amber need extra attention. Mark every row reviewed to enable the CSV download.
          </AlertDescription>
        </Alert>

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
                <TableRow key={row.id} className={cn('entry-row', needsAttention(row) && 'needs-review', row.reviewed && 'reviewed bg-muted/30')}>
                  {FIELDS.map(({ key, label }) => (
                    <TableCell key={key} className="p-1">
                      <Input
                        value={row[key]}
                        placeholder={`${label}…`}
                        aria-label={`${label}, row ${index + 1}`}
                        autoComplete="off"
                        className={cn(
                          'h-8 border-transparent bg-transparent shadow-none dark:bg-transparent',
                          isUncertain(row, key) && 'uncertain border-amber-500/70 bg-amber-100/50 dark:border-amber-500/50 dark:bg-amber-400/10'
                        )}
                        onChange={(event) => update(row.id, (current) => editField(current, key, event.target.value))}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="row-status">
                    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        className="review-checkbox"
                        aria-label={`Mark row ${index + 1} reviewed`}
                        checked={row.reviewed}
                        onCheckedChange={(checked) => update(row.id, (current) => ({ ...current, reviewed: checked === true }))}
                      />
                      Reviewed
                    </label>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !reading && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="text-muted-foreground px-3.5 py-8 text-center text-sm">No entries yet.</TableCell>
                </TableRow>
              )}
              {reading && (
                <TableRow className="reading-row hover:bg-transparent">
                  <TableCell colSpan={5} className="text-muted-foreground px-3.5 text-xs">
                    <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin" aria-hidden="true" />Reading…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="text-muted-foreground text-sm">{reviewSummary(remaining, reading)}</span>
          <Button className="download-button transition-[background-color,transform,opacity] duration-200" disabled={!canDownload(rows, reading) || saving} onClick={onSave}>
            <Download aria-hidden="true" />{saving ? 'Saving…' : 'Download CSV'}
          </Button>
          {notice && <p className="notice text-muted-foreground w-full text-xs [overflow-wrap:anywhere]" role="status" aria-live="polite">{notice}</p>}
        </div>
      </section>

      <Button variant="ghost" size="sm" className="start-over text-muted-foreground -mt-2" onClick={onRestart}>
        <ArrowLeft aria-hidden="true" />Start with another page
      </Button>
    </>
  )
}
