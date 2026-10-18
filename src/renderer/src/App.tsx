import { Check, ChevronUp, ChevronsUpDown, LoaderCircle, ScanText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { SetupPhase } from '@shared/types'
import { Logo } from '@/components/Logo'
import { Results } from '@/components/Results'
import { Setup } from '@/components/Setup'
import { Uploader } from '@/components/Uploader'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { cancelExtract, defaultModel, errorText, extractEntries, getStatus, saveCsv } from '@/lib/api'
import { prepareImage, wrapTurns } from '@/lib/image'
import { toCsvEntries, toRow, type Row } from '@/lib/review'
import { cn } from '@/lib/utils'
import type { Ctx } from '@/layout-prototypes/context'
import { PrototypeSwitcher, initialVariant, type VariantKey } from '@/layout-prototypes/PrototypeSwitcher'
import { VariantB } from '@/layout-prototypes/VariantB'
import { VariantC } from '@/layout-prototypes/VariantC'
import { VariantD } from '@/layout-prototypes/VariantD'

export default function App() {
  const [model, setModel] = useState('')
  const [phase, setPhase] = useState<SetupPhase>('checking')
  const [file, setFile] = useState<File | null>(null)
  /** Quarter turns clockwise the owner gave the photo, for a page photographed sideways. */
  const [turns, setTurns] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  /** How many rows, counted from the top, came from pages read earlier. A new read keeps them. */
  const [keptRows, setKeptRows] = useState(0)
  const [showResults, setShowResults] = useState(false)
  const [reading, setReading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  const ready = phase === 'ready'
  const [variant, setVariant] = useState<VariantKey>(initialVariant)

  async function refreshModels(name: string) {
    try {
      const status = await getStatus(name)
      const names = status.models.length > 0 ? status.models : [name]
      setAvailableModels(names.includes(name) ? names : [name, ...names])
    } catch {
      setAvailableModels([name])
    }
  }

  useEffect(() => {
    void defaultModel().then((name) => {
      setModel(name)
      setAvailableModels([name])
    })
  }, [])

  // Refresh the installed models when the chosen model changes or setup finishes (a download adds one).
  useEffect(() => {
    if (!model) return
    setAvailableModels((current) => (current.includes(model) ? current : [model, ...current]))
    void refreshModels(model)
  }, [model, phase])

  useEffect(() => {
    if (!reading) return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => clearInterval(timer)
  }, [reading])

  async function read() {
    if (!file) return
    flushSync(() => {
      setRows((current) => current.slice(0, keptRows))
      setMessage('')
      setNotice('')
      setReading(true)
      setShowResults(true)
    })
    document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    let count = 0
    try {
      const image = await prepareImage(file, turns)
      const outcome = await extractEntries(image, model.trim(), (entry) => {
        count++
        setRows((current) => [...current, toRow(entry)])
      })
      const rowsRead = `${outcome.count} ${outcome.count === 1 ? 'row' : 'rows'}`
      if (outcome.cancelled) setMessage(`Stopped. ${rowsRead} ${outcome.count === 1 ? 'was' : 'were'} read before you stopped.`)
      else if (outcome.repeating) setMessage(`The model started repeating itself, so reading stopped after ${rowsRead}. Check the rest of the page by hand. If the photo is sideways, turn it with the rotate buttons and read again.`)
    } catch (error) {
      setMessage(errorText(error))
      if (count === 0 && keptRows === 0) setShowResults(false)
    } finally {
      setReading(false)
    }
  }

  async function save() {
    setSaving(true)
    setMessage('')
    setNotice('')
    try {
      const path = await saveCsv(toCsvEntries(rows), `ledger-entries-${new Date().toISOString().slice(0, 10)}.csv`)
      if (path) setNotice(`Saved to ${path}`)
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  function addPage() {
    setKeptRows(rows.length)
    setFile(null)
    setTurns(0)
    setMessage('')
    setNotice('')
    document.querySelector('#add-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function restart() {
    setRows([])
    setKeptRows(0)
    setShowResults(false)
    setFile(null)
    setTurns(0)
    setMessage('')
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const original = (
    <>
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="border-border/70 bg-card/80 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <span className="text-[0.95rem] font-semibold tracking-tight">Ledger Lift</span>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-2xl space-y-6 px-5 py-6 sm:px-6 sm:py-8" data-setup-phase={phase}>
        {model && <Setup model={model} phase={phase} onPhase={setPhase} />}

        {showResults && <Results rows={rows} onRows={setRows} reading={reading} saving={saving} notice={notice} onSave={save} onAddPage={addPage} onRestart={restart} />}

        <section id="add-page" className="bg-card ring-border/80 space-y-5 rounded-xl p-5 shadow-[0_1px_0_var(--surface-tint)] ring-1 sm:p-6" aria-label="Ledger extraction">
          <h1 className="text-base font-semibold tracking-tight">{keptRows > 0 ? 'Add another page' : 'Add a ledger page'}</h1>

          <Uploader
            file={file}
            turns={turns}
            onTurn={(step) => setTurns((current) => wrapTurns(current + step))}
            onChoose={(chosen) => {
              setFile(chosen)
              setTurns(0)
              setMessage('')
            }}
            onClear={() => {
              setFile(null)
              setTurns(0)
            }}
            onReject={setMessage}
          />

          <div className="space-y-1.5">
            <Label htmlFor="model-trigger">Model</Label>
            <Collapsible
              open={modelMenuOpen}
              onOpenChange={(open) => {
                setModelMenuOpen(open)
                if (open && model) void refreshModels(model)
              }}
            >
              <CollapsibleTrigger asChild>
                <button
                  id="model-trigger"
                  type="button"
                  className="border-input bg-background hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left outline-none transition-[background-color,border-color] duration-200 focus-visible:ring-3"
                  aria-label="Reading model"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{model || 'Choose a model'}</span>
                  {modelMenuOpen ? (
                    <ChevronUp className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1.5">
                <ul className="border-input bg-background max-h-48 overflow-y-auto rounded-lg border py-1" role="listbox" aria-label="Installed models">
                  {availableModels.map((name) => (
                    <li key={name} role="option" aria-selected={name === model}>
                      <button
                        type="button"
                        className={cn('hover:bg-muted flex w-full items-center gap-2 px-2.5 py-2 text-left font-mono text-xs transition-colors', name === model && 'bg-muted')}
                        onClick={() => {
                          setModel(name.trim())
                          setModelMenuOpen(false)
                        }}
                      >
                        <Check className={cn('size-3.5 shrink-0', name === model ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                        <span className="min-w-0 truncate">{name}</span>
                      </button>
                    </li>
                  ))}
                  {availableModels.length === 0 && <li className="text-muted-foreground px-2.5 py-2 text-xs">No models found yet.</li>}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="flex flex-col items-stretch gap-2 pt-1">
            <Button size="lg" className="primary-button h-11 w-full transition-[background-color,transform,opacity] duration-200" disabled={!file || !ready || reading} onClick={read}>
              {reading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ScanText aria-hidden="true" />}
              {reading ? `Reading page… ${elapsed}s` : 'Read this page'}
            </Button>
            {reading && (
              <Button variant="link" size="sm" className="stop-button text-destructive mx-auto h-8" onClick={cancelExtract}>Stop</Button>
            )}
            <p className="message text-destructive text-sm empty:hidden" role="status" aria-live="polite">{message}</p>
          </div>
        </section>

      </main>
    </>
  )

  // PROTOTYPE: whole-app layout variants, chosen with ?variant= or the bar at the bottom. Remove when one wins.
  const ctx: Ctx = {
    setup: model ? <Setup model={model} phase={phase} onPhase={setPhase} /> : null,
    ready,
    phase,
    model,
    models: availableModels,
    setModel: (name) => setModel(name.trim()),
    file,
    turns,
    onTurn: (step) => setTurns((current) => wrapTurns(current + step)),
    onChoose: (chosen) => {
      setFile(chosen)
      setTurns(0)
      setMessage('')
    },
    onClear: () => {
      setFile(null)
      setTurns(0)
    },
    onReject: setMessage,
    rows,
    setRows,
    keptRows,
    reading,
    elapsed,
    saving,
    message,
    notice,
    read,
    stop: cancelExtract,
    save,
    addPage,
    restart
  }
  return (
    <>
      {variant === 'A' && original}
      {variant === 'B' && <VariantB ctx={ctx} />}
      {variant === 'C' && <VariantC ctx={ctx} />}
      {variant === 'D' && <VariantD ctx={ctx} />}
      <PrototypeSwitcher current={variant} onChange={setVariant} />
    </>
  )
}
