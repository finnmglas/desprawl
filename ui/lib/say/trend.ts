// owner: finn
// goal: what a number did over a window, off the daily series the history already carries

import type { Series } from "../../../src/read/model.ts"
import type { Compare } from "../app/display.tsx"

const DAY = 86_400_000

export interface Moved {
  /** what the metric did over the window, signed */
  by: number
  /** the window said the way a person would read it back */
  over: string
  /** and the size of it spelled the way its own card spells one, when that is not a count */
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

/** how many days back a comparison reaches, counting today as the first of them */
export function daysBack(compare: Compare, now = new Date()): number {
  if (compare === "none") return 0
  // the year so far is a calendar thing, every other window is a rolling one
  if (compare === "ytd")
    return Math.floor((now.getTime() - Date.parse(`${now.getFullYear()}-01-01`)) / DAY) + 1
  return { "24h": 1, "7d": 7, mo: 30, yr: 365 }[compare]
}

/** one metric summed over the last days of the series, anchored at today rather than at
 * the last commit: a repo nobody touched this week moved by nothing, which is the answer */
function summed(series: Series[], metric: string, days: number, now: number): number {
  const one = series.find((held) => held.metric === metric)
  if (!one || days <= 0 || !one.start) return 0
  const start = Date.parse(one.start)
  if (Number.isNaN(start)) return 0
  // a series day is a midnight, so the window has to start at one too, or the day a reader
  // is standing in falls outside its own 24h
  const from = Math.floor(now / DAY) * DAY - (days - 1) * DAY
  let sum = 0
  for (const [i, value] of one.data.entries()) if (start + i * DAY >= from) sum += value
  return sum
}

/**
 * every daily metric over one window. Lines are the net of what commits added and took out,
 * which is not the same reading as the counted line total: git counts every tracked file,
 * and one of them is a lockfile. It is the only line movement a git repo writes down
 */
export function moved(series: Series[], compare: Compare, now = Date.now()): Record<string, Moved> {
  const days = daysBack(compare, new Date(now))
  const over = OVER[compare]
  const of = (metric: string) => summed(series, metric, days, now)
  return {
    lines: { by: of("insertions") - of("deletions"), over },
    commits: { by: of("commits"), over },
  }
}

/**
 * and the same window read off the repo as it stood then, which is the only way a number
 * the log never wrote down can move: comments, characters, every edge in the import graph
 */
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
