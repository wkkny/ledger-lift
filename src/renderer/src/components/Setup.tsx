import { CircleAlert, Download, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PullProgress, SetupPhase } from '@shared/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { errorText, getStatus, openDownloadPage, pullModel, startOllama, warmModel } from '@/lib/api'

const INSTALL_POLL_MS = 3000

type Props = { model: string; phase: SetupPhase; onPhase: (phase: SetupPhase) => void }

export function Setup({ model, phase, onPhase }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [detail, setDetail] = useState('')
  const [progress, setProgress] = useState<PullProgress | null>(null)
  const [openedDownload, setOpenedDownload] = useState(false)
  const latestCheck = useRef(0)

  const percent = progress?.total ? Math.round((100 * (progress.completed ?? 0)) / progress.total) : null

  /** Walks the owner's setup: Ollama installed, running, and the model downloaded. */
  async function check(modelName: string) {
    const mine = ++latestCheck.current
    const superseded = () => mine !== latestCheck.current
    onPhase('checking')
    setDetail('')
    try {
      let status = await getStatus(modelName)
      if (superseded()) return
      if (!status.running) {
        if (!status.binaryFound) return onPhase('missing-ollama')
        onPhase('starting')
        await startOllama()
        if (superseded()) return
        status = await getStatus(modelName)
        if (superseded()) return
      }
      if (!status.modelReady) return onPhase('need-model')
      onPhase('ready')
      void warmModel(modelName)
    } catch (error) {
      if (superseded()) return
      setDetail(errorText(error))
      onPhase('error')
    }
  }

  async function download() {
    onPhase('downloading')
    setProgress(null)
    setDetail('')
    try {
      await pullModel(model, setProgress)
      await check(model)
    } catch (error) {
      setDetail(errorText(error))
      onPhase('error')
    }
  }

  useEffect(() => {
    void check(model)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, attempt])

  // While the owner installs Ollama in another window, notice it finishing instead of making them come back and click.
  useEffect(() => {
    if (phase !== 'missing-ollama') return
    let stopped = false
    const look = async () => {
      try {
        const status = await getStatus(model)
        if (!stopped && (status.running || status.binaryFound)) setAttempt((n) => n + 1)
      } catch {
        // Keep waiting; the button below still works.
      }
    }
    const timer = setInterval(look, INSTALL_POLL_MS)
    window.addEventListener('focus', look)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', look)
    }
  }, [phase, model])

  if (phase !== 'missing-ollama' && phase !== 'need-model' && phase !== 'downloading' && phase !== 'error') return null

  return (
    <Alert className="setup border-border/80 bg-card px-4 py-3.5 shadow-[0_1px_0_var(--surface-tint)]" variant={phase === 'error' ? 'destructive' : 'default'} aria-live="polite">
      {phase === 'missing-ollama' && (
        <>
          <Download aria-hidden="true" />
          <AlertTitle>Install Ollama to read pages on this computer</AlertTitle>
          <AlertDescription>
            <p>Ollama runs the reading model locally, so your ledger photos never leave this computer.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Download Ollama and open the installer. It does not need an administrator password.</li>
              <li>When the installer finishes, come back here. This screen carries on by itself.</li>
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setOpenedDownload(true)
                  void openDownloadPage()
                }}
              >
                Download Ollama
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Check again</Button>
              {openedDownload && (
                <span className="flex items-center gap-1.5 text-muted-foreground" role="status">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                  Waiting for the installation to finish…
                </span>
              )}
            </div>
          </AlertDescription>
        </>
      )}
      {phase === 'need-model' && (
        <>
          <Download aria-hidden="true" />
          <AlertTitle>One-time download: the reading model</AlertTitle>
          <AlertDescription>
            <p>About 2&nbsp;GB. It is saved on this computer and only needs downloading once.</p>
            <div className="mt-3"><Button size="sm" onClick={download}>Download the model</Button></div>
          </AlertDescription>
        </>
      )}
      {phase === 'downloading' && (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          <AlertTitle>Downloading the reading model{percent === null ? '…' : ` · ${percent}%`}</AlertTitle>
          <AlertDescription>
            <p>{progress?.status ?? 'Starting the download…'}</p>
            <Progress className={percent === null ? 'mt-3 animate-pulse' : 'mt-3'} value={percent ?? 100} aria-label="Model download progress" />
          </AlertDescription>
        </>
      )}
      {phase === 'error' && (
        <>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>The reading model isn't ready</AlertTitle>
          <AlertDescription>
            <p>{detail}</p>
            <div className="mt-3"><Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Try again</Button></div>
          </AlertDescription>
        </>
      )}
    </Alert>
  )
}
