// PROTOTYPE (throwaway): the floating bar that flips between whole-app layouts. Arrow keys work too.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'

export const VARIANTS = [
  { key: 'A', name: 'Current: stacked cards' },
  { key: 'B', name: 'Guided steps' },
  { key: 'C', name: 'Photo beside the rows' },
  { key: 'D', name: 'One row at a time' }
] as const
export type VariantKey = (typeof VARIANTS)[number]['key']

export function initialVariant(): VariantKey {
  if (!import.meta.env.DEV) return 'A'
  const key = new URLSearchParams(location.search).get('variant')?.toUpperCase()
  return VARIANTS.find((variant) => variant.key === key)?.key ?? 'A'
}

export function PrototypeSwitcher({ current, onChange }: { current: VariantKey; onChange: (key: VariantKey) => void }) {
  const index = VARIANTS.findIndex((variant) => variant.key === current)

  useEffect(() => {
    const go = (step: number) => {
      const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length].key
      const url = new URL(location.href)
      url.searchParams.set('variant', next)
      history.replaceState(null, '', url)
      onChange(next)
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    ;(window as unknown as { __go: (step: number) => void }).__go = go
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onChange])

  if (!import.meta.env.DEV) return null
  const go = (step: number) => (window as unknown as { __go: (step: number) => void }).__go(step)
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-xl">
      <button type="button" aria-label="Previous layout" className="rounded-full p-1 hover:bg-white/20" onClick={() => go(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-52 text-center font-medium">{VARIANTS[index].key} · {VARIANTS[index].name}</span>
      <button type="button" aria-label="Next layout" className="rounded-full p-1 hover:bg-white/20" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
