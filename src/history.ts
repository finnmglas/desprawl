// owner: finn
// goal: git log to churn

import { LOG_MAX, git } from "./model.ts"
import type { Churn, Commit, Contributor, Series } from "./model.ts"

// -M writes renames as a{b => c}d or b => c
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

function spread(byDay: Map<string, number[]>, first: string, last: string): Series[] {
  const [start, end] = [first.slice(0, 10), last.slice(0, 10)]
  const data: number[][] = [[], [], []]
  for (let t = Date.parse(start); t <= Date.parse(end); t += DAY) {
    const day = byDay.get(new Date(t).toISOString().slice(0, 10)) ?? [0, 0, 0]
    data.forEach((series, i) => series.push(day[i]))
  }
  return ["commits", "insertions", "deletions"].map((metric, i) => ({
    metric, start, end, granularity: "1d", data: data[i],
  }))
}

// authors, output, loc, ...
export function history(repo: string) {
  const log = git(
    repo,
    "log",
    "-M",
    "--numstat",
    "--pretty=format:%x01%h%x1f%p%x1f%aN%x1f%aE%x1f%aI%x1f%D%x1f%s",
  )
  const by = new Map<string, Contributor & { paths: Set<string>; names: Map<string, number> }>()
  const byPath = new Map<string, Churn>()
  const byDay = new Map<string, number[]>()
  const history: Commit[] = []
  let commits = 0
  let first = ""
  let last = ""

  for (const chunk of log.split("\x01")) {
    if (!chunk.trim()) continue
    const [header, ...rest] = chunk.split("\n")
    const [hash, parents, name, email, date, refs, subject] = header.split("\x1f")
    if (!name) continue

    commits++
    if (!last) last = date // log is newest first
    first = date

    if (history.length < LOG_MAX) {
      history.push({
        hash,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        author: name,
        date,
        refs: refs ?? "",
        subject: subject ?? "",
      })
    }

    const key = (email || name).toLowerCase()
    const c = by.get(key) ?? {
      name, email, commits: 0, insertions: 0, deletions: 0, files: 0, first: date, last: date,
      paths: new Set<string>(), names: new Map<string, number>(),
    }
    c.commits++
    c.names.set(name, (c.names.get(name) ?? 0) + 1)
    c.first = date

    const day = byDay.get(date.slice(0, 10)) ?? [0, 0, 0]
    day[0]++
    for (const line of rest) {
      if (!line) continue
      const [added, deleted, raw] = line.split("\t")
      if (raw === undefined) continue
      // binary shows "-" for both
      const ins = Number(added) || 0
      const del = Number(deleted) || 0
      const path = target(raw)

      c.insertions += ins
      c.deletions += del
      c.paths.add(path)
      day[1] += ins
      day[2] += del

      const p = byPath.get(path) ?? { commits: 0, insertions: 0, deletions: 0, last: "" }
      p.commits++
      p.insertions += ins
      p.deletions += del
      if (!p.last) p.last = date
      byPath.set(path, p)
    }
    byDay.set(date.slice(0, 10), day)
    by.set(key, c)
  }

  const contributors = [...by.values()]
    .map(({ paths, names, ...c }) => ({
      ...c,
      // most used name
      name: [...names].sort((a, b) => b[1] - a[1])[0][0],
      files: paths.size,
    }))
    .sort((a, b) => b.commits - a.commits)

  return { commits, contributors, log: history, first, last, byPath, series: spread(byDay, first, last) }
}
