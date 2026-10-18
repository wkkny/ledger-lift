import { describe, expect, it } from 'vitest'
import type { Entry } from '../shared/types'
import { MAX_REPEATS, RepeatGuard } from './repeats'

const sale = (item: string, amount = '10'): Entry => ({ date: '5/10', item, quantity: '1', amount, uncertainFields: [] })

/** Feeds rows in order; returns what was let through and whether the guard called a loop (and after which row). */
function run(rows: Entry[]) {
  const guard = new RepeatGuard()
  const out: string[] = []
  for (const [index, row] of rows.entries()) {
    const { release, looping } = guard.push(row)
    out.push(...release.map((entry) => entry.item))
    if (looping) return { out, looping, stoppedAt: index }
  }
  out.push(...guard.finish().map((entry) => entry.item))
  return { out, looping: false, stoppedAt: null }
}

describe('RepeatGuard', () => {
  it('lets ordinary rows straight through', () => {
    expect(run([sale('Rice'), sale('Salt'), sale('Tea')])).toEqual({ out: ['Rice', 'Salt', 'Tea'], looping: false, stoppedAt: null })
  })

  it('keeps a real repeat or two, such as two identical sales', () => {
    const rows = [sale('Rice'), sale('Rice'), sale('Salt')]
    expect(run(rows).out).toEqual(['Rice', 'Rice', 'Salt'])
    expect(run([sale('Rice'), sale('Rice')]).out).toEqual(['Rice', 'Rice'])
  })

  it('stops a row copied over and over, and keeps the first one', () => {
    const rows = Array.from({ length: 20 }, () => sale('Pamshoe', '300'))
    const result = run(rows)
    expect(result.looping).toBe(true)
    expect(result.out).toEqual(['Pamshoe'])
    expect(result.stoppedAt).toBe(MAX_REPEATS)
  })

  it('stops two rows taking turns, and keeps the first pair', () => {
    const rows = Array.from({ length: 30 }, (_, i) => (i % 2 ? sale('white sleeper') : sale('black sandal')))
    const result = run(rows)
    expect(result.looping).toBe(true)
    expect(result.out).toEqual(['black sandal', 'white sleeper'])
  })

  it('does not call a loop when the model varies a row, as the amount here', () => {
    const rows = [sale('Rice', '10'), sale('Rice', '11'), sale('Rice', '12'), sale('Rice', '13'), sale('Rice', '14')]
    expect(run(rows)).toEqual({ out: rows.map(() => 'Rice'), looping: false, stoppedAt: null })
  })

  it('releases held repeats when a different row follows, so nothing real is lost', () => {
    const rows = [sale('Rice'), sale('Rice'), sale('Rice'), sale('Salt')]
    expect(run(rows)).toEqual({ out: ['Rice', 'Rice', 'Rice', 'Salt'], looping: false, stoppedAt: null })
  })
})
