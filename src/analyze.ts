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
}

export interface Bucket extends Split {
  name: string
  files: number
  chars: number
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
  modules: Bucket[]
  files: number
  chars: number
  first: string
  last: string
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 30 })

// hash langs have no block form, so docstrings read as code
function classify(text: string, lang: string): Split {
  const hash = HASH.has(lang)
  const [open, close] = MARKUP.has(lang) ? ["<!--", "-->"] : ["/*", "*/"]
  const solo = hash ? "#" : "//"
  const split: Split = { code: 0, comment: 0, blank: 0 }
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
    }
  }
  return split
}

const add = (into: Map<string, Bucket>, name: string, s: Split, chars: number): void => {
  const b = into.get(name) ?? { name, files: 0, chars: 0, code: 0, comment: 0, blank: 0 }
  b.files++
  b.chars += chars
  b.code += s.code
  b.comment += s.comment
  b.blank += s.blank
  into.set(name, b)
}

const rank = (m: Map<string, Bucket>): Bucket[] => [...m.values()].sort((a, b) => b.code - a.code)

// tracked only
function scan(repo: string): Pick<Stats, "languages" | "modules" | "files" | "chars" | keyof Split> {
  const paths = git(repo, "ls-files", "-z").split("\0").filter(Boolean)
  const languages = new Map<string, Bucket>()
  const modules = new Map<string, Bucket>()
  const total: Split = { code: 0, comment: 0, blank: 0 }
  let files = 0
  let chars = 0

  for (const path of paths) {
    const dot = path.lastIndexOf(".")
    const slash = path.lastIndexOf("/")
    const ext = dot > slash + 1 ? path.slice(dot + 1).toLowerCase() : ""
    if (!ext) continue

    let buf: Buffer
    try {
      buf = readFileSync(join(repo, path))
    } catch {
      continue // submodule, broken symlink, or a path deleted since ls-files ran
    }
    // A NUL byte in the first 8 KB means binary. Counting newlines in a PNG is noise.
    if (buf.subarray(0, 8192).includes(0)) continue

    const lang = LANGS[ext] ?? ext
    const text = buf.toString("utf8")
    const s = classify(text, lang)
    add(languages, lang, s, text.length)
    add(modules, slash === -1 ? "(root)" : path.slice(0, path.indexOf("/")), s, text.length)
    total.code += s.code
    total.comment += s.comment
    total.blank += s.blank
    chars += text.length
    files++
  }

  return { languages: rank(languages), modules: rank(modules), files, chars, ...total }
}

// authors, output, loc, ...
function history(repo: string): Pick<Stats, "commits" | "contributors" | "first" | "last"> {
  const log = git(repo, "log", "--numstat", "--pretty=format:%x01%aN%x1f%aE%x1f%aI")
  const by = new Map<string, Contributor & { paths: Set<string>; names: Map<string, number> }>()
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
    for (const line of rest) {
      if (!line) continue
      const [added, deleted, path] = line.split("\t")
      if (path === undefined) continue
      // binary shows "-" for both
      c.insertions += Number(added) || 0
      c.deletions += Number(deleted) || 0
      c.paths.add(path)
    }
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

  return { commits, contributors, first, last }
}

export function analyze(repo: string): Stats {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const head = git(root, "rev-parse", "--short", "HEAD").trim()
  return { repo: root, head, ...history(root), ...scan(root) }
}
