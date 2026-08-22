// owner: finn
// goal: which way a number went

import type { Series } from "../../../src/read/model.ts"
import type { Compare } from "../app/display.tsx"

const DAY = 86_400_000

export interface Moved {
  /** what the metric did over the window, signed */
  by: number
  /** the window said the way a person would read it back */
  over: string
  /** spelled the way its own card spells one, when it is not a count */
  said?: string
}

const OVER: Record<Compare, string> = {
  none: "",
  "24h": "past 24h",
  "7d": "past 7 days",
  mo: "past 30 days",
  yr: "past year",
  ytd: "this year",
}

/** days back, today counting as the first of them */
export function daysBack(compare: Compare, now = new Date()): number {
  if (compare === "none") return 0
  // a calendar window, unlike the rolling ones. Utc throughout: a series day is a utc
  // midnight, and a local new year against a utc one is a window of nothing
  if (compare === "ytd")
    return Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / DAY) + 1
  return { "24h": 1, "7d": 7, mo: 30, yr: 365 }[compare]
}

/** one metric over the last days, anchored at today: a quiet week moved by nothing */
function summed(series: Series[], metric: string, days: number, now: number): number {
  const one = series.find((held) => held.metric === metric)
  if (!one || days <= 0 || !one.start) return 0
  const start = Date.parse(one.start)
  if (Number.isNaN(start)) return 0
  // a series day is a midnight, and so is the window, or today falls outside its own 24h
  const from = Math.floor(now / DAY) * DAY - (days - 1) * DAY
  let sum = 0
  for (const [i, value] of one.data.entries()) if (start + i * DAY >= from) sum += value
  return sum
}

/** every daily metric over one window. Lines are the net a commit added and took out,
 * across every tracked file: the only line movement a git repo writes down */
export function moved(series: Series[], compare: Compare, now = Date.now()): Record<string, Moved> {
  const days = daysBack(compare, new Date(now))
  const over = OVER[compare]
  const of = (metric: string) => summed(series, metric, days, now)
  return {
    lines: { by: of("insertions") - of("deletions"), over },
    commits: { by: of("commits"), over },
  }
}

/** and the same window off a reading of the repo, for the numbers no log wrote down */
export function since(
  was: Record<string, number> | null | undefined,
  compare: Compare,
  now: Record<string, number>,
): Record<string, Moved> {
  const over = OVER[compare]
  if (!was || !over) return {}
  const held: Record<string, Moved> = {}
  for (const [key, value] of Object.entries(now))
    if (typeof was[key] === "number") held[key] = { by: value - was[key], over }
  return held
}
