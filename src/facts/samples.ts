// owner: finn
// goal: the repo measured over its own history, by hour and at even points

import { DAY, believable } from "./history.ts"
import { git } from "../read/model.ts"

export interface Timeline {
  total: number
  first: string
  last: string
  commits: number[]
  devs: number[]
  /** even points, for measuring size across history */
  samples: { hash: string; date: string }[]
}

const SAMPLES = 80

const HOUR = 3_600_000
const hourOf = (ms: number): string => new Date(ms).toISOString().slice(0, 13)

export interface Hours {
  first: string // as 2026-08-15T13
  commits: number[]
  insertions: number[]
  deletions: number[]
  devs: number[]
}

/** every hour between two days, read with the diff */
export function hourly(repo: string, from: string, to: string): Hours {
  // git windows in local time, %at is an instant
  const edge = (day: string, by: number) =>
    new Date(Date.parse(day) + by * DAY).toISOString().slice(0, 10)
  const log = git(
    repo,
    "log",
    `--since=${edge(from, -1)}`,
    `--until=${edge(to, 1)}`,
    "--numstat",
    "--pretty=format:%x01%at%x1f%aE",
  )
  const counts = new Map<string, number>()
  const adds = new Map<string, number>()
  const dels = new Map<string, number>()
  const who = new Map<string, Set<string>>()
  let at = ""
  for (const line of log.split("\n")) {
    if (line.startsWith("\x01")) {
      const [seconds, email] = line.slice(1).split("\x1f")
      const when = Number(seconds)
      at = when && believable(when) ? hourOf(when * 1000) : ""
      if (!at) continue
      counts.set(at, (counts.get(at) ?? 0) + 1)
      const seen = who.get(at) ?? new Set<string>()
      seen.add((email ?? "").toLowerCase())
      who.set(at, seen)
      continue
    }
    if (!at) continue
    const [added, deleted, raw] = line.split("\t")
    if (raw === undefined) continue
    adds.set(at, (adds.get(at) ?? 0) + (Number(added) || 0))
    dels.set(at, (dels.get(at) ?? 0) + (Number(deleted) || 0))
  }

  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T23:00:00Z`)
  const commits: number[] = []
  const insertions: number[] = []
  const deletions: number[] = []
  const devs: number[] = []
  for (let t = start; t <= end; t += HOUR) {
    const key = hourOf(t)
    commits.push(counts.get(key) ?? 0)
    insertions.push(adds.get(key) ?? 0)
    deletions.push(dels.get(key) ?? 0)
    devs.push(who.get(key)?.size ?? 0)
  }
  return { first: hourOf(start), commits, insertions, deletions, devs }
}

// dates and authors only, no diff: fifteen seconds not twenty minutes
export function timeline(repo: string): Timeline {
  const log = git(repo, "log", "--format=%at%x1f%aE%x1f%h")
  const byDay = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  let total = 0
  let min = Infinity
  let max = -Infinity
  const picked: { hash: string; date: string }[] = []

  for (const line of log.split("\n")) {
    if (!line) continue
    const [at, email, hash] = line.split("\x1f")
    const seconds = Number(at)
    if (!seconds) continue
    total++
    // some committer clocks said 1970, some said 2085
    if (!believable(seconds)) continue
    min = Math.min(min, seconds)
    max = Math.max(max, seconds)
    const stamp = new Date(seconds * 1000).toISOString().slice(0, 10)
    counts.set(stamp, (counts.get(stamp) ?? 0) + 1)
    picked.push({ hash, date: stamp })
    const who = byDay.get(stamp) ?? new Set<string>()
    who.add((email ?? "").toLowerCase())
    byDay.set(stamp, who)
  }

  const first = new Date(min * 1000).toISOString().slice(0, 10)
  const last = new Date(max * 1000).toISOString().slice(0, 10)
  const commits: number[] = []
  const devs: number[] = []
  for (let t = Date.parse(first); t <= Date.parse(last); t += DAY) {
    const stamp = new Date(t).toISOString().slice(0, 10)
    commits.push(counts.get(stamp) ?? 0)
    devs.push(byDay.get(stamp)?.size ?? 0)
  }
  // log is newest first, so reverse then thin
  picked.reverse()
  const step = Math.max(1, Math.floor(picked.length / SAMPLES))
  const samples = picked.filter((_, i) => i % step === 0 || i === picked.length - 1)

  return { total, first, last, commits, devs, samples }
}

// bytes at one commit, from the tree, a walk is a quarter second
export const bytesAt = (repo: string, hash: string): number => {
  let total = 0
  for (const line of git(repo, "ls-tree", "-r", "--long", hash).split("\n")) {
    const size = Number(line.split(/\s+/)[3])
    if (size) total += size
  }
  return total
}
