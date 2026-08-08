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

// tree node
export interface Node extends Bucket {
  path: string
  lang?: string
  children?: Node[] // null on files
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
  files: number
  chars: number
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

export const blank = (name: string, path = ""): Node =>
  ({ name, path, files: 0, chars: 0, code: 0, comment: 0, blank: 0, indent: 0 })

export const merge = (into: Node, f: Node): void => {
  into.files++
  into.chars += f.chars
  into.code += f.code
  into.comment += f.comment
  into.blank += f.blank
  into.indent += f.indent
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
      name: path.slice(slash + 1), path, lang, files: 1, chars: text.length,
      ...classify(text, lang),
    })
  }
  return files
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
  const files = scan(root)
  const tree = grow(files)
  const { name, path, lang, children, ...totals } = tree
  return {
    repo: root,
    head,
    ...history(root),
    languages: fold(files, (f) => f.lang ?? ""),
    tree,
    ...totals,
  }
}
