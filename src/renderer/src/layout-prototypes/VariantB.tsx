// PROTOTYPE (throwaway). B, guided steps: one job on screen at a time (photo, check, save), with a stepper on top.
import { Check, CheckCheck, Download, FilePlus2, LoaderCircle, ScanText } from 'lucide-react'
import { useState } from 'react'
import { Uploader } from '@/components/Uploader'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { canDownload, reviewSummary, markAllReviewed, unreviewedCount } from '@/lib/review'
import { cn } from '@/lib/utils'
import type { Ctx } from './context'
import { AppHeader, ModelSelect, RowsTable } from './shared'

type Step = 'photo' | 'check' | 'save'

export function VariantB({ ctx }: { ctx: Ctx }) {
  const [step, setStep] = useState<Step>('photo')
  const { rows } = ctx
  const remaining = unreviewedCount(rows)
  const done = canDownload(rows, ctx.reading)
  const reached: Record<Step, boolean> = { photo: true, check: rows.length > 0 || ctx.reading, save: done }
  const steps: { key: Step; label: string }[] = [
    { key: 'photo', label: ctx.keptRows > 0 ? 'Add a page' : 'Photo' },
    { key: 'check', label: 'Check rows' },
    { key: 'save', label: 'Save' }
  ]

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-5 pt-6 pb-28">
        {ctx.setup}

        <ol className="flex items-center gap-2" aria-label="Steps">
          {steps.map(({ key, label }, index) => (
            <li key={key} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!reached[key]}
                onClick={() => setStep(key)}
                className={cn(
                  'flex flex-1 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
                  step === key ? 'border-primary bg-card font-semibold shadow-sm' : 'border-border bg-muted/40'
                )}
              >
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs', step === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {reached[key] && step !== key && key !== 'photo' ? <Check className="size-3.5" /> : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 'photo' && (
          <section className="bg-card ring-border/80 space-y-5 rounded-xl p-6 ring-1">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{ctx.keptRows > 0 ? 'Add another page' : 'Add a ledger page'}</h1>
              <p className="text-muted-foreground text-sm">One page at a time. Lay it flat in good light and fill the frame.</p>
            </div>
            <Uploader file={ctx.file} turns={ctx.turns} onTurn={ctx.onTurn} onChoose={ctx.onChoose} onClear={ctx.onClear} onReject={ctx.onReject} />
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer">Change the reading model</summary>
              <div className="pt-2"><ModelSelect ctx={ctx} /></div>
            </details>
            <Button size="lg" className="h-12 w-full text-base" disabled={!ctx.file || !ctx.ready || ctx.reading} onClick={() => { setStep('check'); ctx.read() }}>
              <ScanText />Read this page
            </Button>
            {rows.length > 0 && <Button variant="link" className="mx-auto flex h-8" onClick={() => setStep('check')}>Back to the {rows.length} rows</Button>}
            <p className="text-destructive text-sm empty:hidden" role="status">{ctx.message}</p>
          </section>
        )}

        {step === 'check' && (
          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight">Check the rows</h1>
                <span className="text-muted-foreground text-sm tabular-nums">{rows.length - remaining} of {rows.length} checked</span>
              </div>
              <Progress value={rows.length ? (100 * (rows.length - remaining)) / rows.length : 0} className="h-1.5" />
              <p className="text-muted-foreground text-sm">Rows with an amber box are ones the model was unsure of. Fix them, then tick the row.</p>
            </div>
            <p className="text-destructive text-sm empty:hidden" role="status">{ctx.message}</p>
            <RowsTable ctx={ctx} />
          </section>
        )}

        {step === 'save' && (
          <section className="bg-card ring-border/80 flex flex-col items-center gap-4 rounded-xl p-10 text-center ring-1">
            <span className="grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"><CheckCheck className="size-7" /></span>
            <h1 className="text-xl font-semibold tracking-tight">{rows.length} rows are checked</h1>
            <p className="text-muted-foreground max-w-sm text-sm">The CSV opens in Excel, Numbers and Google Sheets.</p>
            <Button size="lg" className="h-12 px-8 text-base" disabled={ctx.saving} onClick={ctx.save}><Download />{ctx.saving ? 'Saving…' : 'Download CSV'}</Button>
            {ctx.notice && <p className="text-muted-foreground text-xs [overflow-wrap:anywhere]" role="status">{ctx.notice}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { ctx.addPage(); setStep('photo') }}><FilePlus2 />Add another page</Button>
              <Button variant="ghost" size="sm" onClick={() => { ctx.restart(); setStep('photo') }}>Start over</Button>
            </div>
          </section>
        )}
      </main>

      {step === 'check' && (
        <div className="border-border/70 bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-3 pb-14">
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              {ctx.reading && <LoaderCircle className="size-4 animate-spin" />}
              {ctx.reading ? `Reading… ${ctx.elapsed}s` : reviewSummary(remaining, false)}
              {ctx.reading && <Button variant="link" size="sm" className="text-destructive h-6 px-1" onClick={ctx.stop}>Stop</Button>}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={ctx.reading} onClick={() => { ctx.addPage(); setStep('photo') }}><FilePlus2 />Add another page</Button>
              <Button variant="outline" size="sm" disabled={ctx.reading || remaining === 0} onClick={() => ctx.setRows(markAllReviewed(rows))}><CheckCheck />Mark all reviewed</Button>
              <Button disabled={!done} onClick={() => setStep('save')}>Continue to save</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
