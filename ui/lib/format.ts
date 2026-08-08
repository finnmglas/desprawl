// owner: finn
// goal: same numbers as the cli

import type { Curve } from "./display.tsx"
import { locale } from "./locale.ts"
import { human } from "../../src/human.ts"
import type { Node, Split } from "../../src/model.ts"

let abbreviate = true

/** Set before render, so num() below reads the current mode. */
export const setSimple = (on: boolean) => {
  abbreviate = on
}

export const num = (n: number) => (abbreviate ? human(n, 3) : n.toLocaleString(locale()))
export const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? "" : "s"}`

export const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%")
// tables sort on the raw iso, this is only what the reader sees
export const day = (iso: string) => {
  const date = iso.slice(0, 10)
  if (!date) return "-"
  return locale().startsWith("en") ? date : new Date(date).toLocaleDateString(locale())
}
export const tokens = (chars: number) => Math.round(chars / 4)
export const nest = (s: Split) => (s.code ? (s.indent / s.code).toFixed(1) : "0.0")
export const churn = (n: Node) => n.insertions + n.deletions

// excel style conditional formatting, a cell against the biggest in its column
export function backdrop(
  value: number,
  peak: number,
  color = "var(--chart-2)",
  curve: Curve = "linear",
): React.CSSProperties | undefined {
  if (!peak || !Number.isFinite(value) || value <= 0) return undefined
  // log lifts the small values so a skewed column stays readable
  const share = curve === "log" ? Math.log1p(value) / Math.log1p(peak) : value / peak
  const width = Math.min(100, share * 100)
  const tint = `color-mix(in oklch, ${color} 22%, transparent)`
  return { backgroundImage: `linear-gradient(to left, ${tint} ${width}%, transparent ${width}%)` }
}

export interface Sort {
  key: string
  asc: boolean
}

// third click clears rather than toggling forever
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
