// owner: finn
// goal: git log to churn

import { COMMIT_MAX, LOG_MAX, git } from "./model.ts"
import type { Churn, Commit, Contributor, Series } from "./model.ts"

// -M writes renames as a{b => c}d or b => c
const source = (path: string): string => {
  const open = path.indexOf("{")
  if (open === -1) {
    const arrow = path.indexOf(" => ")
    return arrow === -1 ? path : path.slice(0, arrow)
  }
  const close = path.indexOf("}", open)
  const inner = path.slice(open + 1, close)
  return path.slice(0, open) + inner.slice(0, inner.indexOf(" => ")) + path.slice(close + 1)
}

function target(path: string): string {
  const open = path.indexOf("{")
  if (open === -1) {
    const arrow = path.indexOf(" => ")
    return arrow === -1 ? path : path.slice(arrow + 4)
  }
  const close = path.indexOf("}", open)
  const inner = path.slice(open + 1, close)
  return path.slice(0, open) + inner.slice(inner.indexOf(" => ") + 4) + path.slice(close + 1)
}

const DAY = 86_400_000

// before git existed, so older means a broken clock
const EARLIEST = 631_152_000

// the window a real commit date falls in, five kernel commits sit outside it
const believable = (seconds: number): boolean =>
  seconds >= EARLIEST && seconds * 1000 <= Date.now() + DAY

const sane = (iso: string): boolean => believable(Date.parse(iso) / 1000)

// every day first to last, the axis the series uses
function days(first: string, last: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(first.slice(0, 10)); t <= Date.parse(last.slice(0, 10)); t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

function spread(byDay: Map<string, number[]>, first: string, last: string): Series[] {
  const [start, end] = [first.slice(0, 10), last.slice(0, 10)]
  const data: number[][] = [[], [], []]
  for (let t = Date.parse(start); t <= Date.parse(end); t += DAY) {
    const day = byDay.get(new Date(t).toISOString().slice(0, 10)) ?? [0, 0, 0]
    data.forEach((series, i) => series.push(day[i]))
  }
  // prettier-ignore
  return ["commits", "insertions", "deletions"].map((metric, i) => ({
    metric, start, end, granularity: "1d", data: data[i],
  }))
}

export interface Parsed {
  hash: string
  parents: string[]
  name: string
  email: string
  date: string
  refs: string
  subject: string
  files: { ins: number; del: number; path: string }[]
}

const FORMAT = "--pretty=format:%x01%h%x1f%p%x1f%aN%x1f%aE%x1f%aI%x1f%D%x1f%s"

function* parse(log: string, thin = false): Generator<Parsed> {
  for (const chunk of log.split("\x01")) {
    if (!chunk.trim()) continue
    const [header, ...rest] = chunk.split("\n")
    const [hash, parents, name, email, date, refs, subject] = header.split("\x1f")
    if (!name) continue
    const files = []
    for (const raw_ of rest) {
      const line = thin ? counted(raw_) : raw_
      if (!line) continue
      const [added, deleted, raw] = line.split("\t")
      if (raw === undefined) continue
      files.push({ ins: Number(added) || 0, del: Number(deleted) || 0, path: target(raw) })
    }
    yield {
      hash,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      name,
      email,
      date,
      refs: refs ?? "",
      subject: subject ?? "",
      files,
    }
  }
}

export interface Detail {
  hash: string
  author: string
  email: string
  date: string
  subject: string
  body: string
  files: { ins: number; del: number; path: string }[]
}

// one commit, whole message and every file it touched
export function detail(repo: string, hash: string): Detail {
  const out = git(
    repo,
    "show",
    "-M",
    "--numstat",
    "--format=%h%x1f%aN%x1f%aE%x1f%aI%x1f%s%x1f%b%x02",
    hash,
  )
  const [head, rest = ""] = out.split("\x02")
  const [h, author, email, date, subject, body] = head.split("\x1f")
  const files = rest
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length === 3)
    .map(([ins, del, path]) => ({
      ins: Number(ins) || 0,
      del: Number(del) || 0,
      path: target(path),
    }))
  return { hash: h, author, email, date, subject, body: (body ?? "").trim(), files }
}

// older commits, to walk back without reading everything
export function page(repo: string, skip: number, count: number, names: string[]): Commit[] {
  const thin = thinly(repo)
  const log = git(
    repo,
    "log",
    "-M",
    `--skip=${skip}`,
    `-n${count}`,
    thin ? "--name-status" : "--numstat",
    FORMAT,
  )
  const seat = new Map(names.map((n, i) => [n, i]))
  return [...parse(log, thin)].map((c) => ({
    hash: c.hash,
    parents: c.parents,
    insertions: c.files.reduce((a, f) => a + f.ins, 0),
    deletions: c.files.reduce((a, f) => a + f.del, 0),
    who: seat.get((c.email || c.name).toLowerCase()) ?? -1,
    date: c.date,
    refs: c.refs,
    subject: c.subject,
  }))
}

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

// every commit, dates and authors only. no diff, so fifteen seconds not twenty minutes
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

// the true total behind a capped read, slow, ask once
/** what moved in a window, per file, renames followed */
export interface Move {
  up: number
  down: number
  /** commits per contributor, to name who moved it */
  by: Record<number, number>
}

/** what one person did in the window */
export interface Did {
  commits: number
  insertions: number
  deletions: number
  files: number
}

export interface Moved {
  paths: Record<string, Move>
  /** by contributor index, for the same days */
  people: Record<number, Did>
}

export function moved(repo: string, from: string, to: string, names: string[] = []): Moved {
  const log = git(
    repo,
    "log",
    "-M",
    `--since=${from}`,
    `--until=${to} 23:59:59`,
    "--numstat",
    "--pretty=format:%x01%aN%x1f%aE",
  )
  const seat = new Map(names.map((n, i) => [n, i]))
  const renamed = new Map<string, string>()
  const now = (path: string): string => {
    let at = path
    for (let hops = 0; renamed.has(at) && hops < 20; hops++) at = renamed.get(at)!
    return at
  }
  const found: Record<string, Move> = {}
  const people: Record<number, Did> = {}
  const touched = new Map<number, Set<string>>()
  let who = -1
  for (const line of log.split("\n")) {
    if (line.startsWith("\x01")) {
      const [name, email] = line.slice(1).split("\x1f")
      who = seat.get((email || name).toLowerCase()) ?? -1
      if (who >= 0) {
        const did = (people[who] ??= { commits: 0, insertions: 0, deletions: 0, files: 0 })
        did.commits++
      }
      continue
    }
    const [added, deleted, raw] = line.split("\t")
    if (raw === undefined) continue
    const path = now(target(raw))
    if (raw.includes(" => ")) renamed.set(source(raw), path)
    const at = (found[path] ??= { up: 0, down: 0, by: {} })
    at.up += Number(added) || 0
    at.down += Number(deleted) || 0
    if (who < 0) continue
    at.by[who] = (at.by[who] ?? 0) + 1
    const did = people[who]
    did.insertions += Number(added) || 0
    did.deletions += Number(deleted) || 0
    const mine = touched.get(who) ?? new Set<string>()
    mine.add(path)
    touched.set(who, mine)
  }
  for (const [at, paths] of touched) people[at].files = paths.size
  return { paths: found, people }
}

export const count = (repo: string): number =>
  Number(git(repo, "rev-list", "--count", "HEAD").trim()) || 0

// authors, output, loc, ...
/**
 * A blobless clone has the commits and the trees but not the contents. Asking it for
 * --numstat makes git fetch every blob in the history back over the network, one round
 * trip at a time, which never finishes. Names it still knows for free.
 */
function thinly(repo: string): boolean {
  try {
    return !!git(repo, "config", "--get", "remote.origin.partialclonefilter").trim()
  } catch {
    return false
  }
}

/** name-status carries no counts, so it is reshaped into the numstat the parser knows */
const counted = (line: string): string => {
  const parts = line.split("\t")
  if (parts.length < 2) return ""
  return parts.length > 2 ? `0\t0\t${parts[1]} => ${parts[2]}` : `0\t0\t${parts[1]}`
}

export function history(repo: string, cap = COMMIT_MAX) {
  const thin = thinly(repo)
  const log = git(
    repo,
    "log",
    "-M",
    `-n${cap}`,
    thin ? "--name-status" : "--numstat",
    "--pretty=format:%x01%h%x1f%p%x1f%aN%x1f%aE%x1f%aI%x1f%D%x1f%s",
  )
  const by = new Map<string, Contributor & { paths: Set<string>; names: Map<string, number> }>()
  const byPath = new Map<string, Churn>()
  // path to author key to commits, so a folder can say who actually works in it
  const byWho = new Map<string, Map<string, number>>()
  // the log runs newest first, so a rename is met before the commits under the old name
  const renamed = new Map<string, string>()
  const now = (path: string): string => {
    let at = path
    for (let hops = 0; renamed.has(at) && hops < 20; hops++) at = renamed.get(at)!
    return at
  }
  const byDay = new Map<string, number[]>()
  const whoByDay = new Map<string, Set<string>>()
  const history: Commit[] = []
  const byCommit: string[] = [] // identity key per commit, resolved once sorted
  let commits = 0
  let first = ""
  let last = ""
  // every date unbelievable is still better than no dates at all
  let oldest = ""
  let newest = ""

  for (const chunk of log.split("\x01")) {
    if (!chunk.trim()) continue
    const [header, ...rest] = chunk.split("\n")
    const [hash, parents, name, email, date, refs, subject] = header.split("\x1f")
    if (!name) continue

    commits++
    // min and max, not first and last seen, so one wrong clock cannot invert the range
    if (sane(date)) {
      if (!first || Date.parse(date) < Date.parse(first)) first = date
      if (!last || Date.parse(date) > Date.parse(last)) last = date
    }
    if (!oldest || Date.parse(date) < Date.parse(oldest)) oldest = date
    if (!newest || Date.parse(date) > Date.parse(newest)) newest = date

    const size: Commit = {
      hash,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      insertions: 0,
      deletions: 0,
      who: 0,
      date,
      refs: refs ?? "",
      subject: subject ?? "",
    }
    const key = (email || name).toLowerCase()
    if (history.length < LOG_MAX) {
      history.push(size)
      byCommit.push(key)
    }

    // prettier-ignore
    const c = by.get(key) ?? {
      name, email, commits: 0, insertions: 0, deletions: 0, files: 0, first: date, last: date,
      paths: new Set<string>(), names: new Map<string, number>(),
    }
    c.commits++
    c.names.set(name, (c.names.get(name) ?? 0) + 1)
    c.first = date

    const stamp = date.slice(0, 10)
    const day = byDay.get(stamp) ?? [0, 0, 0]
    day[0]++
    const who = whoByDay.get(stamp) ?? new Set<string>()
    who.add(key)
    whoByDay.set(stamp, who)
    for (const raw_ of rest) {
      const line = thin ? counted(raw_) : raw_
      if (!line) continue
      const [added, deleted, raw] = line.split("\t")
      if (raw === undefined) continue
      // binary shows "-" for both
      const ins = Number(added) || 0
      const del = Number(deleted) || 0
      const path = now(target(raw))
      if (raw.includes(" => ")) renamed.set(source(raw), path)

      c.insertions += ins
      c.deletions += del
      size.insertions += ins
      size.deletions += del
      c.paths.add(path)
      day[1] += ins
      day[2] += del

      const hands = byWho.get(path) ?? new Map<string, number>()
      hands.set(key, (hands.get(key) ?? 0) + 1)
      byWho.set(path, hands)

      const p = byPath.get(path) ?? { commits: 0, insertions: 0, deletions: 0, last: "", by: {} }
      p.commits++
      p.insertions += ins
      p.deletions += del
      if (!p.last) p.last = date
      byPath.set(path, p)
    }
    byDay.set(date.slice(0, 10), day)
    by.set(key, c)
  }

  // a repo where every clock is wrong still gets a range, just an odd one
  if (!first) first = oldest
  if (!last) last = newest

  const contributors = [...by.values()]
    .map(({ paths, names, ...c }) => ({
      ...c,
      // most used name
      name: [...names].sort((a, b) => b[1] - a[1])[0][0],
      files: paths.size,
    }))
    .sort((a, b) => b.commits - a.commits)

  // indices need the final order
  const order = new Map(contributors.map((c, i) => [(c.email || c.name).toLowerCase(), i]))
  history.forEach((commit, i) => {
    commit.who = order.get(byCommit[i]) ?? 0
  })

  const active = days(first, last).map((stamp) =>
    [...(whoByDay.get(stamp) ?? [])].map((key) => order.get(key) ?? 0),
  )

  return {
    commits,
    truncated: commits >= cap,
    thin,
    contributors,
    log: history,
    active,
    first,
    last,
    byPath,
    // resolved to the same indices the contributor list uses
    byWho: new Map(
      [...byWho].map(([path, hands]) => [
        path,
        Object.fromEntries(
          [...hands].map(([key, n]) => [order.get(key) ?? 0, n] as const),
        ) as Record<number, number>,
      ]),
    ),
    series: spread(byDay, first, last),
  }
}
