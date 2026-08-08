// owner: finn
// goal: repo stats

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ts = "TypeScript"
const js = "JavaScript"

const LANGS: Record<string, string> = {
  ts, tsx: ts, mts: ts, cts: ts,
  js: js, jsx: js, mjs: js, cjs: js,
  rs: "Rust", py: "Python", go: "Go", rb: "Ruby", java: "Java", kt: "Kotlin",
  c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++", cs: "C#", swift: "Swift", php: "PHP",
  css: "CSS", scss: "SCSS", html: "HTML", vue: "Vue", svelte: "Svelte",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", sql: "SQL", prisma: "Prisma",
  md: "Markdown", sh: "Shell", bash: "Shell", flow: "Flow",
}

const HASH = new Set(["Python", "Shell", "YAML", "TOML", "Ruby"])
const MARKUP = new Set(["HTML", "Markdown", "Vue", "Svelte", "xml"])

export interface Split {
  code: number
  comment: number
  blank: number
  indent: number // nesting lv++
}

export interface Bucket extends Split {
  name: string
  files: number
  chars: number
}

export interface Churn {
  commits: number
  insertions: number
  deletions: number
  last: string // newest touch
}

// tree node
export interface Node extends Bucket, Churn {
  path: string
  lang?: string
  children?: Node[] // null on files
}

// granular time series
export interface Series {
  metric: string
  start: string
  end: string
  granularity: string
  data: number[]
}

// estimate
export const tokens = (chars: number): number => Math.round(chars / 4)

export interface Contributor {
  name: string
  email: string
  commits: number
  insertions: number
  deletions: number
  files: number
  first: string
  last: string
}

export interface Stats extends Split {
  repo: string
  head: string
  commits: number
  contributors: Contributor[]
  languages: Bucket[]
  tree: Node
  series: Series[]
  files: number
  chars: number
  insertions: number
  deletions: number
  first: string
  last: string
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 30 })

// tab or 2 spaces
function nesting(raw: string): number {
  let width = 0
  for (const ch of raw) {
    if (ch === " ") width += 1
    else if (ch === "\t") width += 2
    else break
  }
  return width >> 1
}

// hash langs: docstrings read as code
function classify(text: string, lang: string): Split {
  const hash = HASH.has(lang)
  const [open, close] = MARKUP.has(lang) ? ["<!--", "-->"] : ["/*", "*/"]
  const solo = hash ? "#" : "//"
  const split: Split = { code: 0, comment: 0, blank: 0, indent: 0 }
  let inBlock = false

  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (inBlock) {
      split.comment++
      if (line.includes(close)) inBlock = false
    } else if (!line) {
      split.blank++
    } else if (line.startsWith(solo)) {
      split.comment++
    } else if (!hash && line.startsWith(open)) {
      split.comment++
      inBlock = !line.includes(close)
    } else {
      split.code++
      split.indent += nesting(raw)
    }
  }
  return split
}

export const blank = (name: string, path = ""): Node => ({
  name, path, files: 0, chars: 0, code: 0, comment: 0, blank: 0, indent: 0,
  commits: 0, insertions: 0, deletions: 0, last: "",
})

export const merge = (into: Node, f: Node): void => {
  into.files++
  into.chars += f.chars
  into.code += f.code
  into.comment += f.comment
  into.blank += f.blank
  into.indent += f.indent
  into.commits += f.commits
  into.insertions += f.insertions
  into.deletions += f.deletions
  if (f.last > into.last) into.last = f.last
}

const rank = <T extends Bucket>(list: T[]): T[] => list.sort((a, b) => b.code - a.code)

function fold(files: Node[], key: (f: Node) => string): Bucket[] {
  const by = new Map<string, Node>()
  for (const f of files) {
    const name = key(f)
    const b = by.get(name) ?? blank(name)
    merge(b, f)
    by.set(name, b)
  }
  return rank([...by.values()])
}

function grow(files: Node[]): Node {
  const root = blank("")
  const dirs = new Map<string, Node>([["", root]])

  for (const f of files) {
    merge(root, f)
    const parts = f.path.split("/")
    let at = root
    for (const [i, part] of parts.entries()) {
      at.children ??= []
      if (i === parts.length - 1) {
        at.children.push(f)
        break
      }
      const path = parts.slice(0, i + 1).join("/")
      let next = dirs.get(path)
      if (!next) {
        next = blank(part, path)
        dirs.set(path, next)
        at.children.push(next)
      }
      merge(next, f)
      at = next
    }
  }
  const sort = (n: Node): void => {
    if (!n.children) return
    rank(n.children)
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

// tracked only
function scan(repo: string): Node[] {
  const files: Node[] = []

  for (const path of git(repo, "ls-files", "-z").split("\0").filter(Boolean)) {
    const dot = path.lastIndexOf(".")
    const slash = path.lastIndexOf("/")
    const ext = dot > slash + 1 ? path.slice(dot + 1).toLowerCase() : ""
    if (!ext) continue

    let buf: Buffer
    try {
      buf = readFileSync(join(repo, path))
    } catch {
      continue // submodule, symlink, raced delete
    }
    // NUL in first 8 KB means binary
    if (buf.subarray(0, 8192).includes(0)) continue

    const lang = LANGS[ext] ?? ext
    const text = buf.toString("utf8")
    files.push({
      ...blank(path.slice(slash + 1), path), lang, files: 1, chars: text.length,
      ...classify(text, lang),
    })
  }
  return files
}

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
function history(repo: string) {
  const log = git(repo, "log", "-M", "--numstat", "--pretty=format:%x01%aN%x1f%aE%x1f%aI")
  const by = new Map<string, Contributor & { paths: Set<string>; names: Map<string, number> }>()
  const byPath = new Map<string, Churn>()
  const byDay = new Map<string, number[]>()
  let commits = 0
  let first = ""
  let last = ""

  for (const chunk of log.split("\x01")) {
    if (!chunk.trim()) continue
    const [header, ...rest] = chunk.split("\n")
    const [name, email, date] = header.split("\x1f")
    if (!name) continue

    commits++
    if (!last) last = date // log is newest first
    first = date

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

  return { commits, contributors, first, last, byPath, series: spread(byDay, first, last) }
}

export function analyze(repo: string): Stats {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const head = git(root, "rev-parse", "--short", "HEAD").trim()
  const files = scan(root)
  const { byPath, ...hist } = history(root)
  for (const f of files) Object.assign(f, byPath.get(f.path))

  const tree = grow(files)
  // commits and last would clobber the repo-wide pair
  const { name, path, lang, children, commits, last, ...totals } = tree
  return {
    repo: root,
    head,
    ...hist,
    languages: fold(files, (f) => f.lang ?? ""),
    tree,
    ...totals,
  }
}
