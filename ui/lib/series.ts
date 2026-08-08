// owner: finn
// goal: time chart series

import { transform } from "../components/chart.tsx"
import type { Curve } from "./display.tsx"
import { spans, type Grain } from "./format.ts"
import type { Stats } from "../../src/model.ts"

export interface Spec {
  label: string
  color: string
  about: string
  /** sum adds the bucket's days, last takes its final value, distinct unions the people. */
  how: "sum" | "last" | "distinct"
  /** Series sharing a group share one peak, so their relative sizes stay true. */
  group: string
  /** Drawn below the axis. */
  down?: boolean
}

// added and removed mean the same thing wherever they appear, so the colours live here
export const ADDED = "#22c55e"
export const REMOVED = "var(--destructive)"

// the token palette is five blues, so these are picked to stay apart from each other
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
  devs: {
    label: "devs",
    color: "#f97316",
    group: "devs",
    how: "distinct",
    about: "different people who committed, counted once per bucket",
  },
}

/** What the legend offers. added and removed are one choice, they are the same unit. */
export const GROUPS: { key: string; label: string; series: string[]; about: string }[] = [
  { key: "commits", label: "commits", series: ["commits"], about: SERIES.commits.about },
  {
    key: "changes",
    label: "changes",
    series: ["added", "removed"],
    about: "lines added and removed, sharing one scale so the balance is honest",
  },
  { key: "lines", label: "net lines", series: ["lines"], about: SERIES.lines.about },
  { key: "devs", label: "devs", series: ["devs"], about: SERIES.devs.about },
]

export const expand = (groups: string[]): string[] =>
  groups.flatMap((key) => GROUPS.find((g) => g.key === key)?.series ?? [])

export interface Row {
  day: string
  [key: string]: string | number
}

/** Daily values per series, before any bucketing. */
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

export function rows(stats: Stats, picked: string[], grain: Grain, curve: Curve): Row[] {
  const commits = stats.series.find((s) => s.metric === "commits")
  if (!commits || !picked.length) return []

  const groups = spans(commits.data.length, commits.start, grain)
  // more than one series means the magnitudes differ, so each is drawn against its own peak
  const share = new Set(picked.map((k) => SERIES[k].group)).size > 1

  const raw: Record<string, number[]> = {}
  for (const key of picked) {
    const data = daily(stats, key)
    raw[key] = groups.map(({ days }) => {
      if (SERIES[key].how === "last") return Math.max(0, data[days[days.length - 1]] ?? 0)
      if (SERIES[key].how === "distinct") {
        const seen = new Set<number>()
        for (const i of days) for (const who of stats.active[i] ?? []) seen.add(who)
        return seen.size
      }
      return days.reduce((a, i) => a + (data[i] ?? 0), 0)
    })
  }

  // one peak per group, so added and removed keep their true ratio to each other
  const peaks: Record<string, number> = {}
  for (const key of picked) {
    const group = SERIES[key].group
    peaks[group] = Math.max(peaks[group] ?? 1, ...raw[key])
  }

  return groups.map(({ day }, i) => {
    const row: Row = { day }
    for (const key of picked) {
      const value = raw[key][i]
      // normalise in the curve's own space, or log would have no effect on an overlay
      const peak = peaks[SERIES[key].group]
      const scaled = share
        ? (transform(value, curve) / (transform(peak, curve) || 1)) * 100
        : transform(value, curve)
      row[key] = SERIES[key].down ? -scaled : scaled
      // the tooltip always tells the truth, whatever the axis is doing
      row[`${key}_raw`] = SERIES[key].down ? -value : value
    }
    return row
  })
}
