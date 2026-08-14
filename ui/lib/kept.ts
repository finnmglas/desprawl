// owner: finn
// goal: what a tab was showing, still there when you come back to it

import { useState } from "react"

// a tab is unmounted the moment another one is opened, so every grain, filter, sort and
// camera it held would be gone by the time the reader returns to it. This outlives the
// component and not the page: a reload is still a fresh start
const held = new Map<string, unknown>()

/** useState, except the value survives the view being unmounted and mounted again */
export function useKept<T>(key: string, initial: T): [T, (next: T | ((was: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (held.has(key) ? (held.get(key) as T) : initial))
  const set = (next: T | ((was: T) => T)) =>
    setValue((was) => {
      const now = typeof next === "function" ? (next as (was: T) => T)(was) : next
      held.set(key, now)
      return now
    })
  return [value, set]
}

/** the same store for what lives in a ref: read on mount, written on the way out */
export const recall = <T>(key: string): T | undefined => held.get(key) as T | undefined
export const keep = (key: string, value: unknown): void => void held.set(key, value)
