// owner: finn
// goal: git log to churn

import { COMMIT_MAX, LOG_MAX, git } from "./model.ts"
import { SIGNERS } from "./stack.ts"
import type { Churn, Commit, Contributor, Series } from "./model.ts"

/** letters and digits only, so casing, initials and spacing never split one person in two */
export const norm = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "")

/** a prefix, not a substring, and five characters at least */
export const near = (a: string, b: string): boolean =>
  Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a))

/** what it signs as, so a tool reads apart from a person */
const botOf = (name: string, email: string): string =>
  SIGNERS.find(([match]) => match.test(name) || match.test(email))?.[1] ??
  (/\[bot\]/.test(email) ? "bot" : "")

// -M writes renames as a{b => c}d, or b => c
const source = (path: string): string => {
  if (!path.includes(" => ")) return path
  const open = path.indexOf("{")
  if (open === -1) return path.slice(0, path.indexOf(" => "))
  const close = path.indexOf("}", open)
  const inner = path.slice(open + 1, close)
  return path.slice(0, open) + inner.slice(0, inner.indexOf(" => ")) + path.slice(close + 1)
}

function target(path: string): string {
  if (!path.includes(" => ")) return path
  const open = path.indexOf("{")
  if (open === -1) return path.slice(path.indexOf(" => ") + 4)
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
/** a blobless clone would fetch every blob to count lines */
function thinly(repo: string): boolean {
  try {
    return !!git(repo, "config", "--get", "remote.origin.partialclonefilter").trim()
  } catch {
    return false
  }
}

/** name-status carries no counts, so it is reshaped into numstat */
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
  // newest first, so a rename is met before the old name's commits
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
    // min and max, so one wrong clock cannot invert the range
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

  // one row per raw identity, for whoever wants folding turned off
  const identities: Contributor[] = [...by.values()]
    .map(({ paths, names, ...c }) => {
      const name = [...names].sort((a, b) => b[1] - a[1])[0][0]
      return { ...c, name, files: paths.size, bot: botOf(name, c.email) || undefined }
    })
    .sort((a, b) => b.commits - a.commits)

  // union-find, merged on an unmistakable name prefix. .mailmap is the real fix
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  const keys = [...by.keys()]
  for (const k of keys) parent.set(k, k)
  const bestName = (k: string) => [...by.get(k)!.names].sort((a, b) => b[1] - a[1])[0][0]
  for (let i = 0; i < keys.length; i++) {
    const ni = norm(bestName(keys[i]))
    for (let j = i + 1; j < keys.length; j++) {
      if (!near(ni, norm(bestName(keys[j])))) continue
      const ra = find(keys[i])
      const rb = find(keys[j])
      if (ra !== rb) parent.set(ra, rb)
    }
  }
  const clusters = new Map<string, string[]>()
  for (const k of keys) {
    const root = find(k)
    clusters.set(root, [...(clusters.get(root) ?? []), k])
  }

  const merged = [...clusters.values()]
    .map((group) => {
      const people = group.map((k) => by.get(k)!)
      const names = new Map<string, number>()
      const paths = new Set<string>()
      for (const p of people) {
        for (const [name, n] of p.names) names.set(name, (names.get(name) ?? 0) + n)
        for (const path of p.paths) paths.add(path)
      }
      // the identity with the most commits speaks for the group
      const lead = [...people].sort((a, b) => b.commits - a.commits)[0]
      const name = [...names].sort((a, b) => b[1] - a[1])[0][0]
      const also =
        group.length > 1
          ? people.map((p) => p.email).filter((e) => e && e !== lead.email)
          : undefined
      return {
        group,
        name,
        email: lead.email,
        commits: people.reduce((sum, p) => sum + p.commits, 0),
        insertions: people.reduce((sum, p) => sum + p.insertions, 0),
        deletions: people.reduce((sum, p) => sum + p.deletions, 0),
        files: paths.size,
        first: people.reduce(
          (min, p) => (Date.parse(p.first) < Date.parse(min) ? p.first : min),
          people[0].first,
        ),
        last: people.reduce(
          (max, p) => (Date.parse(p.last) > Date.parse(max) ? p.last : max),
          people[0].last,
        ),
        also,
        bot: botOf(name, lead.email) || undefined,
      }
    })
    .sort((a, b) => b.commits - a.commits)

  // every raw identity in a cluster points at the same, final row
  const order = new Map<string, number>()
  merged.forEach(({ group }, i) => group.forEach((k) => order.set(k, i)))
  const contributors: Contributor[] = merged.map(({ group, ...c }) => c)

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
    identities,
    log: history,
    active,
    first,
    last,
    byPath,
    // summed, since a merge can land two identities on one index
    byWho: new Map(
      [...byWho].map(([path, hands]) => {
        const at: Record<number, number> = {}
        for (const [key, n] of hands) {
          const i = order.get(key) ?? 0
          at[i] = (at[i] ?? 0) + n
        }
        return [path, at]
      }),
    ),
    series: spread(byDay, first, last),
  }
}
