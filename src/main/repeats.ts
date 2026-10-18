// Small vision models sometimes get stuck writing the same rows over and over until they run out of room.

import type { Entry } from '../shared/types'

/** A loop repeats a block of rows this long or shorter. */
const MAX_PERIOD = 3
/** Rows in a row that copy one from up to `MAX_PERIOD` rows earlier before the model is judged to be looping. */
export const MAX_REPEATS = 3

const sameSale = (a: Entry, b: Entry) =>
  a.date === b.date && a.item === b.item && a.quantity === b.quantity && a.amount === b.amount

/**
 * Passes rows through, but holds back ones that copy an earlier row until it is clear whether they are real
 * (two identical sales do happen) or the model looping. Once `MAX_REPEATS` copies arrive in a row, the held rows
 * are dropped and `looping` is true; the caller should stop reading.
 */
export class RepeatGuard {
  private seen: Entry[] = []
  private held: Entry[] = []

  push(entry: Entry): { release: Entry[]; looping: boolean } {
    const isCopy = Array.from({ length: Math.min(MAX_PERIOD, this.seen.length) }, (_, i) => this.seen[this.seen.length - 1 - i]).some(
      (earlier) => sameSale(earlier, entry)
    )
    this.seen.push(entry)
    if (!isCopy) return { release: [...this.takeHeld(), entry], looping: false }
    this.held.push(entry)
    if (this.held.length < MAX_REPEATS) return { release: [], looping: false }
    this.held = []
    return { release: [], looping: true }
  }

  /** Rows still held when the model finished by itself: they were real. */
  finish(): Entry[] {
    return this.takeHeld()
  }

  private takeHeld(): Entry[] {
    const held = this.held
    this.held = []
    return held
  }
}
