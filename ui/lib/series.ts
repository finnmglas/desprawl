// owner: finn
// goal: time chart series

import { transform } from "./curve.ts"
import type { Curve } from "./display.tsx"
import { spans, type Grain } from "./format.ts"
import type { Hours, Timeline } from "../../src/history.ts"
import type { Stats } from "../../src/model.ts"

export interface Spec {
  label: string
  color: string
  about: string
  /** sum adds days, last takes the final value, distinct unions people */
  how: "sum" | "last" | "distinct"
  /** Series sharing a group share one peak, so their relative sizes stay true. */
  group: string
  /** Drawn below the axis. */
  down?: boolean
  /** a headcount is not a volume, so it is a line with nothing filled under it */
  heads?: boolean
}

// one definition, the tables use these too
export const ADDED = "#22c55e"
export const REMOVED = "var(--destructive)"

// the token palette is five blues, these stay apart
export const SERIES: Record<string, Spec> = {
  commits: {
    label: "commits",
    color: "#a855f7",
    group: "commits",
    how: "sum",
    about: "commits made",
  },
  added: {
    label: "added",
    color: ADDED,
    group: "changes",
    how: "sum",
    about: "lines inserted",
  },
  removed: {
    label: "removed",
    color: REMOVED,
    group: "changes",
    down: true,
    how: "sum",
    about: "lines deleted, drawn below the axis",
  },
  lines: {
    label: "net lines",
    color: "var(--chart-2)",
    group: "lines",
    how: "last",
    about: "insertions minus deletions accumulated, a growth curve rather than a true size",
  },
  size: {
    label: "git_byte_size",
    color: "#14b8a6",
    group: "size",
    how: "last",
    about: "bytes git tracks, measured at points across all of history rather than accumulated",
  },
  devs: {
    label: "devs",
    // grey, since orange beside the red of removed lines reads as another warning
    color: "var(--muted-foreground)",
    group: "devs",
    how: "distinct",
    heads: true,
    about: "different people who committed, counted once per bucket",
  },
}

// added and removed are one choice, same unit
export const GROUPS: { key: string; label: string; series: string[]; about: string }[] = [
  { key: "commits", label: "commits", series: ["commits"], about: SERIES.commits.about },
  {
    key: "changes",
    label: "changes",
    series: ["added", "removed"],
    about: "lines added and removed, sharing one scale so the balance is honest",
  },
  { key: "lines", label: "net lines", series: ["lines"], about: SERIES.lines.about },
  { key: "size", label: "git_byte_size", series: ["size"], about: SERIES.size.about },
  { key: "devs", label: "devs", series: ["devs"], about: SERIES.devs.about },
]

export const expand = (groups: string[]): string[] =>
  groups.flatMap((key) => GROUPS.find((g) => g.key === key)?.series ?? [])

export interface Row {
  day: string
  [key: string]: string | number
}

// daily, before bucketing
function daily(stats: Stats, key: string): number[] {
  const at = (name: string) => stats.series.find((s) => s.metric === name)?.data ?? []
  if (key === "added") return at("insertions")
  if (key === "removed") return at("deletions")
  if (key === "lines") {
    const [ins, del] = [at("insertions"), at("deletions")]
    let running = 0
    return ins.map((v, i) => (running += v - (del[i] ?? 0)))
  }
  return at("commits")
}

const DAY = 86_400_000
const HOUR = 3_600_000

/** the buckets and their numbers */
interface Built {
  groups: { day: string; days: number[] }[]
  raw: Record<string, (number | undefined)[]>
}

/** by the hour, one point per bucket */
function byHour(hours: Hours, picked: string[], sizes?: { date: string; bytes: number }[]): Built {
  const start = Date.parse(`${hours.first}:00:00Z`)
  const length = hours.commits.length
  const groups = Array.from({ length }, (_, i) => ({
    day: new Date(start + i * HOUR).toISOString().slice(0, 13),
    days: [i],
  }))
  let running = 0
  const net = hours.insertions.map((v, i) => (running += v - (hours.deletions[i] ?? 0)))

  const raw: Record<string, (number | undefined)[]> = {}
  for (const key of picked) {
    if (key === "size") {
      // daily readings, each held from its midnight
      const filled: (number | undefined)[] = new Array(length).fill(undefined)
      for (const one of sizes ?? []) {
        const i = Math.round((Date.parse(`${one.date}T00:00:00Z`) - start) / HOUR)
        if (i >= 0 && i < length) filled[i] = one.bytes
      }
      let carried: number | undefined
      for (let i = 0; i < length; i++) filled[i] = carried = filled[i] ?? carried
      raw[key] = filled
      continue
    }
    raw[key] =
      key === "added"
        ? hours.insertions
        : key === "removed"
          ? hours.deletions
          : key === "lines"
            ? net
            : key === "devs"
              ? hours.devs
              : hours.commits
  }
  return { groups, raw }
}

// windowed series stay undefined outside their window, a gap rather than a false zero
export function rows(
  stats: Stats,
  picked: string[],
  grain: Grain,
  curve: Curve,
  all?: Timeline | null,
  sizes?: { date: string; bytes: number }[],
  hours?: Hours | null,
): Row[] {
  const commits = stats.series.find((s) => s.metric === "commits")
  if (!commits || !picked.length) return []
  // magnitudes differ, so each group is drawn against its own peak
  const shares = new Set(picked.map((k) => SERIES[k].group)).size > 1
  if (grain === "hour")
    return hours ? finish(byHour(hours, picked, sizes), picked, curve, shares) : []

  // span all history only when something shown covers it
  const wide = picked.some((k) => k === "commits" || k === "devs" || k === "size")
  const spanning = all && wide ? all : null
  const first = spanning ? spanning.first : commits.start
  const length = spanning ? spanning.commits.length : commits.data.length
  // where the analysed window begins on the axis
  const offset = Math.round((Date.parse(commits.start) - Date.parse(first)) / DAY)
  const groups = spans(length, first, grain)

  const raw: Record<string, (number | undefined)[]> = {}
  for (const key of picked) {
    // commits and devs from all history when known, the rest from the window
    // sparse readings, carried forward
    if (key === "size") {
      const filled: (number | undefined)[] = new Array(length).fill(undefined)
      for (const s of sizes ?? []) {
        const i = Math.round((Date.parse(s.date) - Date.parse(first)) / DAY)
        if (i >= 0 && i < length) filled[i] = s.bytes
      }
      let carried: number | undefined
      for (let i = 0; i < length; i++) filled[i] = carried = filled[i] ?? carried
      raw[key] = groups.map(({ days }) => filled[days[days.length - 1]])
      continue
    }

    const full = spanning && (key === "commits" || key === "devs")
    const data = full ? (key === "commits" ? spanning.commits : spanning.devs) : daily(stats, key)
    const shift = full ? 0 : offset
    const at = (i: number) => (i - shift >= 0 ? data[i - shift] : undefined)

    raw[key] = groups.map(({ days }) => {
      const known = days.filter((i) => at(i) !== undefined)
      if (!known.length) return undefined
      if (SERIES[key].how === "last") return Math.max(0, at(known[known.length - 1]) ?? 0)
      if (SERIES[key].how === "distinct") {
        // daily counts cannot be unioned, so a bucket says its busiest day
        if (full) return Math.max(...known.map((i) => at(i) ?? 0))
        const seen = new Set<number>()
        for (const i of known) for (const who of stats.active[i - shift] ?? []) seen.add(who)
        return seen.size
      }
      return known.reduce((a, i) => a + (at(i) ?? 0), 0)
    })
  }

  return finish({ groups, raw }, picked, curve, shares)
}

// magnitudes differ across groups, so each is drawn against its own peak
function finish(built: Built, picked: string[], curve: Curve, share: boolean): Row[] {
  const { groups, raw } = built
  const peaks: Record<string, number> = {}
  for (const key of picked) {
    const group = SERIES[key].group
    peaks[group] = Math.max(peaks[group] ?? 1, ...raw[key].map((v) => v ?? 0))
  }

  return groups.map(({ day }, i) => {
    const row: Row = { day }
    for (const key of picked) {
      const value = raw[key][i]
      if (value === undefined) continue // a gap, not a zero
      const peak = peaks[SERIES[key].group]
      const scaled = share
        ? (transform(value, curve) / (transform(peak, curve) || 1)) * 100
        : transform(value, curve)
      row[key] = SERIES[key].down ? -scaled : scaled
      row[`${key}_raw`] = SERIES[key].down ? -value : value
    }
    return row
  })
}
