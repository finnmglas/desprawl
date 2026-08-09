// owner: finn
// goal: same numbers as the cli

import type { Curve } from "./display.tsx"
import { locale } from "./locale.ts"
export { nest, pct, tokens } from "../../src/human.ts"
import { human } from "../../src/human.ts"
import type { Node } from "../../src/model.ts"

let abbreviate = true

/** Set before render, so num() below reads the current mode. */
export const setSimple = (on: boolean) => {
  abbreviate = on
}

export const num = (n: number) => (abbreviate ? human(n, 3) : n.toLocaleString(locale()))
export const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? "" : "s"}`

// tables sort on raw iso, this is display only
export const day = (iso: string) => {
  const date = iso.slice(0, 10)
  if (!date) return "-"
  return locale().startsWith("en") ? date : new Date(date).toLocaleDateString(locale())
}
export const churn = (n: Node) => n.insertions + n.deletions

// excel style, a cell against its column's biggest
export function backdrop(
  value: number,
  peak: number,
  color = "var(--chart-2)",
  curve: Curve = "linear",
): React.CSSProperties | undefined {
  if (!peak || !Number.isFinite(value) || value <= 0) return undefined
  // log lifts small values in a skewed column
  const share = curve === "log" ? Math.log1p(value) / Math.log1p(peak) : value / peak
  const width = Math.min(100, share * 100)
  const tint = `color-mix(in oklch, ${color} 22%, transparent)`
  return { backgroundImage: `linear-gradient(to left, ${tint} ${width}%, transparent ${width}%)` }
}

export interface Sort {
  key: string
  asc: boolean
}

// third click clears
export const cycle = (sort: Sort | null, key: string): Sort | null =>
  sort?.key !== key ? { key, asc: false } : sort.asc ? null : { key, asc: true }

export type Grain = "day" | "week" | "month" | "year"
export const GRAINS: Grain[] = ["day", "week", "month", "year"]

const DAY_MS = 86_400_000

/** Label a date with the bucket it falls in. Weeks start Monday, in UTC. */
function label(date: Date, grain: Grain): string {
  const iso = date.toISOString().slice(0, 10)
  if (grain === "day") return iso
  if (grain === "year") return iso.slice(0, 4)
  if (grain === "month") return iso.slice(0, 7)
  const monday = new Date(date)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

// days when young, months once long
export function defaultGrain(first: string, last: string): Grain {
  const days = (Date.parse(last.slice(0, 10)) - Date.parse(first.slice(0, 10))) / DAY_MS + 1
  if (days < 14) return "day"
  if (days > 5 * 365) return "month"
  return "week"
}

// the day indices per bucket, to sum, take the last or union
export function spans(
  length: number,
  start: string,
  grain: Grain,
): { day: string; days: number[] }[] {
  const from = Date.parse(start)
  const out: { day: string; days: number[] }[] = []
  const seen = new Map<string, number>()
  for (let i = 0; i < length; i++) {
    const key = label(new Date(from + i * DAY_MS), grain)
    const at = seen.get(key)
    if (at === undefined) {
      seen.set(key, out.length)
      out.push({ day: key, days: [i] })
    } else {
      out[at].days.push(i)
    }
  }
  return out
}

/** Sum a dense daily series into coarser buckets, order preserved. */
export function bucket(data: number[], start: string, grain: Grain): [string, number][] {
  const from = Date.parse(start)
  const totals = new Map<string, number>()
  data.forEach((value, i) => {
    const key = label(new Date(from + i * DAY_MS), grain)
    totals.set(key, (totals.get(key) ?? 0) + value)
  })
  return [...totals]
}
