// owner: finn
// goal: same numbers as the cli

import type { Curve } from "./display.tsx"
import { locale } from "./locale.ts"
export { nest, pct, tokens, weight } from "../../src/human.ts"
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
/** the date a filter or an api compares, unlike day() below, which is for reading */
export const stamp = (at: Date): string => at.toISOString().slice(0, 10)

/** how long ago, in the largest unit that still says something */
export function ago(iso: string): string {
  const at = Date.parse(iso)
  if (!at) return ""
  const days = Math.round((at - Date.now()) / 864e5)
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(days) < 7
      ? [days, "day"]
      : Math.abs(days) < 31
        ? [Math.round(days / 7), "week"]
        : Math.abs(days) < 365
          ? [Math.round(days / 30.4), "month"]
          : [Math.round(days / 365.25), "year"]
  return new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }).format(n, unit)
}

export const day = (iso: string) => {
  const date = iso.slice(0, 10)
  if (!date) return "-"
  return locale().startsWith("en") ? date : new Date(date).toLocaleDateString(locale())
}
/** a long path loses its middle: the ends say where it lives and what it is */
export function shortPath(path: string, max = 38): string {
  if (path.length <= max) return path
  const parts = path.split("/")
  if (parts.length < 3) return `${path.slice(0, max / 2)}…${path.slice(-max / 2 + 1)}`
  const tail: string[] = []
  let room = max - parts[0].length - 2
  for (let i = parts.length - 1; i > 0; i--) {
    if (tail.length && room - parts[i].length - 1 < 0) break
    tail.unshift(parts[i])
    room -= parts[i].length + 1
  }
  return [parts[0], "…", ...tail].join("/")
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

export type Grain = "hour" | "day" | "week" | "month" | "year"
export const GRAINS: Grain[] = ["hour", "day", "week", "month", "year"]

/** the shortest span each grain can say anything with, in days */
const NEEDS: Record<Grain, number> = { hour: 0, day: 0, week: 7, month: 31, year: 365 }
/** and the longest */
const HOLDS: Partial<Record<Grain, number>> = { hour: 31 }

/** grains this span can draw. Day always survives */
export const grainsFor = (days: number): Grain[] =>
  GRAINS.filter((g) => days >= NEEDS[g] && days <= (HOLDS[g] ?? Infinity))

/** nearest grain this span can carry */
export function nearestGrain(want: Grain, offered: Grain[]): Grain {
  if (offered.includes(want)) return want
  const from = GRAINS.indexOf(want)
  const away = (g: Grain) => Math.abs(GRAINS.indexOf(g) - from)
  return offered.reduce((best, g) => (away(g) < away(best) ? g : best), offered[0] ?? "day")
}

const DAY_MS = 86_400_000

/** Label a date with the bucket it falls in. Weeks start Monday, in UTC. */
function label(date: Date, grain: Grain): string {
  if (grain === "hour") return date.toISOString().slice(0, 13)
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

/** the instant a bucket label starts, whatever granularity wrote it */
export const startsAt = (label: string): number =>
  Date.parse(
    label.length === 4
      ? `${label}-01-01`
      : label.length === 7
        ? `${label}-01`
        : label.length === 13
          ? `${label}:00:00Z`
          : label,
  )

/** and the instant it ends, so two granularities can be compared */
export function endsAt(label: string, grain: Grain): number {
  const from = new Date(startsAt(label))
  if (grain === "year") from.setUTCFullYear(from.getUTCFullYear() + 1)
  else if (grain === "month") from.setUTCMonth(from.getUTCMonth() + 1)
  else if (grain === "hour") from.setUTCHours(from.getUTCHours() + 1)
  else from.setUTCDate(from.getUTCDate() + (grain === "week" ? 7 : 1))
  return from.getTime() - 1
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
