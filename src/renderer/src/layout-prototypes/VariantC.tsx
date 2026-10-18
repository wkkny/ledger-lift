// PROTOTYPE (throwaway). C, photo beside the rows: the page photo stays in view while you check the rows against it.
import { CheckCheck, Download, FilePlus2, LoaderCircle, ScanText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { canDownload, markAllReviewed, reviewSummary, unreviewedCount } from '@/lib/review'
import type { Ctx } from './context'
import { AppHeader, BigPhoto, ModelSelect, RowsTable } from './shared'

export function VariantC({ ctx }: { ctx: Ctx }) {
  const { rows } = ctx
  const remaining = unreviewedCount(rows)
  return (
    <>
      <AppHeader>
        <Badge variant="secondary" className="tabular-nums">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</Badge>
      </AppHeader>
      <main className="mx-auto max-w-6xl space-y-5 px-5 py-5 pb-24">
        {ctx.setup}
        <div className="grid items-start gap-5 md:grid-cols-[19rem_1fr]">
          <aside className="bg-card ring-border/80 sticky top-[4.5rem] space-y-3 rounded-xl p-3 ring-1">
            <BigPhoto ctx={ctx} className="aspect-[3/4] w-full" />
            <Button size="lg" className="h-11 w-full" disabled={!ctx.file || !ctx.ready || ctx.reading} onClick={ctx.read}>
              {ctx.reading ? <LoaderCircle className="animate-spin" /> : <ScanText />}
              {ctx.reading ? `Reading… ${ctx.elapsed}s` : 'Read this page'}
            </Button>
            {ctx.reading && <Button variant="link" size="sm" className="text-destructive mx-auto flex h-6" onClick={ctx.stop}>Stop</Button>}
            {rows.length > 0 && (
              <Button variant="outline" size="sm" className="w-full" disabled={ctx.reading} onClick={ctx.addPage}><FilePlus2 />Add another page</Button>
            )}
            <ModelSelect ctx={ctx} />
            <p className="text-destructive text-sm empty:hidden" role="status">{ctx.message}</p>
          </aside>

          <section className="bg-card ring-border/80 space-y-4 rounded-xl p-5 ring-1">
            <div>
              <h1 className="text-base font-semibold tracking-tight">Rows from the page</h1>
              <p className="text-muted-foreground text-sm">Compare each row with the photo on the left. Amber means the model was unsure.</p>
            </div>
            {rows.length === 0 && !ctx.reading ? (
              <div className="text-muted-foreground grid h-64 place-items-center rounded-lg border border-dashed text-sm">Rows appear here as the page is read.</div>
            ) : (
              <RowsTable ctx={ctx} />
            )}
            <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="text-muted-foreground text-sm">{reviewSummary(remaining, ctx.reading)}</span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={ctx.reading || remaining === 0} onClick={() => ctx.setRows(markAllReviewed(rows))}><CheckCheck />Mark all reviewed</Button>
                <Button disabled={!canDownload(rows, ctx.reading) || ctx.saving} onClick={ctx.save}><Download />{ctx.saving ? 'Saving…' : 'Download CSV'}</Button>
              </div>
              {ctx.notice && <p className="text-muted-foreground w-full text-xs [overflow-wrap:anywhere]" role="status">{ctx.notice}</p>}
            </div>
            {rows.length > 0 && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={ctx.restart}>Start over</Button>}
          </section>
        </div>
      </main>
    </>
  )
}
