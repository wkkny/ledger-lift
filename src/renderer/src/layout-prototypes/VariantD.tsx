// PROTOTYPE (throwaway). D, one row at a time: a big card for the row being checked, a strip of dots to jump around.
import { ArrowLeft, ArrowRight, Check, CheckCheck, Download, FilePlus2, LoaderCircle, ScanText } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { FIELDS, canDownload, editField, isUncertain, markAllReviewed, needsAttention, unreviewedCount } from '@/lib/review'
import { cn } from '@/lib/utils'
import type { Ctx } from './context'
import { AppHeader, BigPhoto, ModelSelect } from './shared'

export function VariantD({ ctx }: { ctx: Ctx }) {
  const { rows } = ctx
  const [at, setAt] = useState(0)
  const index = Math.min(at, Math.max(rows.length - 1, 0))
  const row = rows[index]
  const remaining = unreviewedCount(rows)
  const flagged = rows.filter((each) => needsAttention(each) && !each.reviewed).length
  const finished = rows.length > 0 && canDownload(rows, ctx.reading)
  const showCard = rows.length > 0

  const confirm = () => {
    if (!row) return
    ctx.setRows(rows.map((each) => (each.id === row.id ? { ...each, reviewed: true } : each)))
    setAt(Math.min(index + 1, rows.length - 1))
  }
  const nextFlagged = () => {
    const from = rows.findIndex((each, i) => i > index && needsAttention(each) && !each.reviewed)
    const first = rows.findIndex((each) => needsAttention(each) && !each.reviewed)
    const target = from >= 0 ? from : first
    if (target >= 0) setAt(target)
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-5 px-5 py-6 pb-24">
        {ctx.setup}

        {!showCard && (
          <section className="bg-card ring-border/80 mx-auto max-w-xl space-y-4 rounded-xl p-6 ring-1">
            <h1 className="text-lg font-semibold tracking-tight">Add a ledger page</h1>
            <BigPhoto ctx={ctx} className="h-64 w-full" />
            <ModelSelect ctx={ctx} />
            <Button size="lg" className="h-12 w-full text-base" disabled={!ctx.file || !ctx.ready || ctx.reading} onClick={ctx.read}>
              {ctx.reading ? <LoaderCircle className="animate-spin" /> : <ScanText />}
              {ctx.reading ? `Reading page… ${ctx.elapsed}s` : 'Read this page'}
            </Button>
            <p className="text-destructive text-sm empty:hidden" role="status">{ctx.message}</p>
          </section>
        )}

        {showCard && row && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-48 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">Row {index + 1} of {rows.length}{ctx.reading ? '+' : ''}</span>
                  <span className="text-muted-foreground tabular-nums">{rows.length - remaining} checked</span>
                </div>
                <Progress value={(100 * (rows.length - remaining)) / rows.length} className="h-1.5" />
              </div>
              {flagged > 0 && <Button variant="outline" size="sm" className="border-amber-500/60 bg-amber-100/50 dark:bg-amber-400/10" onClick={nextFlagged}>{flagged} to look at · jump</Button>}
              {ctx.reading && <span className="text-muted-foreground flex items-center gap-1.5 text-sm"><LoaderCircle className="size-4 animate-spin" />Reading… {ctx.elapsed}s<Button variant="link" size="sm" className="text-destructive h-6 px-1" onClick={ctx.stop}>Stop</Button></span>}
            </div>

            <div className="grid items-start gap-5 md:grid-cols-[16rem_1fr]">
              <div className="space-y-2">
                <BigPhoto ctx={ctx} className="aspect-[3/4] w-full" />
                {ctx.file && (
                  <Button variant="outline" size="sm" className="w-full" disabled={!ctx.ready || ctx.reading} onClick={ctx.read}><ScanText />{ctx.keptRows > 0 || rows.length > 0 ? 'Read this photo' : 'Read this page'}</Button>
                )}
              </div>

              <section className="bg-card ring-border/80 space-y-5 rounded-xl p-6 ring-1">
                <div className="grid grid-cols-2 gap-4">
                  {FIELDS.map(({ key, label }) => (
                    <label key={key} className={cn('space-y-1.5', key === 'item' && 'col-span-2')}>
                      <span className="text-muted-foreground text-xs tracking-wide uppercase">{label}</span>
                      <Input
                        value={row[key]}
                        placeholder={`${label}…`}
                        autoFocus={key === 'amount'}
                        className={cn('h-12 text-lg', isUncertain(row, key) && 'border-amber-500/70 bg-amber-100/50 dark:bg-amber-400/10')}
                        onChange={(event) => ctx.setRows(rows.map((each) => (each.id === row.id ? editField(each, key, event.target.value) : each)))}
                        onKeyDown={(event) => event.key === 'Enter' && confirm()}
                      />
                      {isUncertain(row, key) && <span className="block text-xs text-amber-700 dark:text-amber-300">Not sure about this one. Check it against the photo.</span>}
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Button variant="outline" disabled={index === 0} onClick={() => setAt(index - 1)}><ArrowLeft />Back</Button>
                  <Button size="lg" className="h-12 flex-1 text-base" onClick={confirm}>
                    {row.reviewed ? <ArrowRight /> : <Check />}{row.reviewed ? 'Next row' : 'Looks right'}
                  </Button>
                </div>
              </section>
            </div>

            <nav aria-label="All rows" className="flex flex-wrap gap-1.5">
              {rows.map((each, i) => (
                <button
                  key={each.id}
                  type="button"
                  aria-label={`Row ${i + 1}`}
                  onClick={() => setAt(i)}
                  className={cn(
                    'size-8 rounded-md border text-xs font-medium tabular-nums transition-colors',
                    each.reviewed ? 'border-emerald-500/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200' : needsAttention(each) ? 'border-amber-500/70 bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-card',
                    i === index && 'ring-primary ring-2'
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </nav>

            <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="text-muted-foreground text-sm">{finished ? 'Every row is checked.' : `${remaining} ${remaining === 1 ? 'row' : 'rows'} still to check.`}</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { ctx.restart(); setAt(0) }}>Start over</Button>
                <Button variant="outline" size="sm" disabled={ctx.reading} onClick={() => { ctx.addPage(); }}><FilePlus2 />Add another page</Button>
                <Button variant="outline" size="sm" disabled={ctx.reading || remaining === 0} onClick={() => ctx.setRows(markAllReviewed(rows))}><CheckCheck />Mark all reviewed</Button>
                <Button disabled={!finished || ctx.saving} onClick={ctx.save}><Download />{ctx.saving ? 'Saving…' : 'Download CSV'}</Button>
              </div>
              {ctx.notice && <p className="text-muted-foreground w-full text-xs [overflow-wrap:anywhere]" role="status">{ctx.notice}</p>}
            </div>
          </>
        )}
      </main>
    </>
  )
}
