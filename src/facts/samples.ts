// owner: finn
// goal: the repo measured over its own history, by hour and at even points

import { DAY, believable } from "./history.ts"
import { git, made, type Made } from "../read/model.ts"

export interface Timeline extends Made {
  total: number
  first: string
  last: string
  commits: number[]
  devs: number[]
  /** even points, for measuring size across history, each in the repo it was read from */
  samples: { hash: string; date: string; repo: string }[]
}

/** one repo, or a folder of them read as one */
const each = (repo: string | string[]): string[] => (Array.isArray(repo) ? repo : [repo])

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
export function hourly(repo: string | string[], from: string, to: string): Hours {
  // git windows in local time, %at is an instant
  const edge = (day: string, by: number) =>
    new Date(Date.parse(day) + by * DAY).toISOString().slice(0, 10)
  const counts = new Map<string, number>()
  const adds = new Map<string, number>()
  const dels = new Map<string, number>()
  const who = new Map<string, Set<string>>()
  // every repo read into the same hours, so a folder of them counts each person once
  const log = each(repo)
    .map((one) =>
      git(
        one,
        "log",
        `--since=${edge(from, -1)}`,
        `--until=${edge(to, 1)}`,
        "--numstat",
        "--pretty=format:%x01%at%x1f%aE",
      ),
    )
    .join("\n")
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
export function timeline(repo: string | string[]): Timeline {
  const byDay = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  let total = 0
  let min = Infinity
  let max = -Infinity
  const picked: { hash: string; date: string; repo: string }[] = []

  const mine = each(repo)
  const log = mine.map((one) => git(one, "log", `--format=%at%x1f%aE%x1f%h%x1f${one}`)).join("\n")
  for (const line of log.split("\n")) {
    if (!line) continue
    const [at, email, hash, from] = line.split("\x1f")
    const seconds = Number(at)
    if (!seconds) continue
    total++
    // some committer clocks said 1970, some said 2085
    if (!believable(seconds)) continue
    min = Math.min(min, seconds)
    max = Math.max(max, seconds)
    const stamp = new Date(seconds * 1000).toISOString().slice(0, 10)
    counts.set(stamp, (counts.get(stamp) ?? 0) + 1)
    picked.push({ hash, date: stamp, repo: from })
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
  const want = Math.max(2, Math.floor(SAMPLES / mine.length))
  const samples = mine.flatMap((one) => {
    const held = picked.filter((sample) => sample.repo === one)
    const step = Math.max(1, Math.floor(held.length / want))
    return held.filter((_, i) => i % step === 0 || i === held.length - 1)
  })

  return { ...made(mine[0] ?? ""), total, first, last, commits, devs, samples }
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
