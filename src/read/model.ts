// owner: finn
// goal: shapes and their ops

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

// one level up from src in the repo, and from dist in the package
const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"),
) as {
  version: string
  engines: { node: string }
}

export const VERSION: string = manifest.version
export const ENGINE: string = manifest.engines.node

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
  langs: Record<string, number> // loc per language below here
}

export interface Churn {
  commits: number
  insertions: number
  deletions: number
  last: string // newest touch
  /** commits per contributor index, so a folder can name who works in it */
  /** commits per contributor id */
  by: Record<string, number>
}

// tree node
export interface Node extends Bucket, Churn {
  path: string
  /** the language of a file, "" for a folder, which is what every text field here says */
  lang: string
  children?: Node[] // null on files
  /** files left out of a served tree, fetched when opened */
  leaves?: number
}

// granular time series
export interface Series {
  metric: string
  start: string
  end: string
  granularity: string
  data: number[]
}

// newest first, capped so a long history cannot bloat the report
export interface Commit {
  hash: string
  parents: string[]
  insertions: number
  deletions: number
  /** Index into contributors, the merged identity */
  /** the contributor id who wrote it */
  who: number
  date: string
  refs: string // branch and tag decorations
  subject: string
}

export const LOG_MAX = 10000

// a full linux kernel log is twenty minutes, so history is read newest first to here
export const COMMIT_MAX = 20000

export interface Remote {
  name: string
  /** Browsable https url, ssh and .git resolved */
  url: string
  host: "github" | "gitlab" | "bitbucket" | "git"
}

export interface Contributor {
  /**
   * what every index in this payload means: a commit's who, the keys of a folder's by,
   * and the days in active all name this. An identity carries the id of the person it
   * was folded into, so the two lists can be read together
   */
  id: number
  name: string
  email: string
  commits: number
  insertions: number
  deletions: number
  files: number
  first: string
  last: string
  /** other emails folded into this row, since a name this close is not a coincidence */
  also?: string[]
  /** what it signs as, so a tool reads apart from a person */
  bot?: string
}

export interface Manifest {
  path: string
  name?: string
  version?: string
  license?: string
  private?: boolean
  manager?: string
  workspaces: boolean
  /** Ships a command, so the package is a cli */
  bin: boolean
  /** module, commonjs, or unset */
  type?: string
  engines?: Record<string, string>
  deps: Record<string, string>
  scripts: Record<string, string>
}

export interface Pinning {
  exact: number
  caret: number
  tilde: number
  range: number
  linked: number
}

export interface Ai {
  /** every ai tool the repo shows a trace of */
  tools: string[]
  /** the instruction files, as markers, and how many of each the tree holds */
  files: Record<string, number>
  /** commits an ai signed, and how many of the newest were read to find them */
  signed: number
  scanned: number
  /** the read hit its cap, so older commits went unseen */
  capped: boolean
  /** commits signed, per tool */
  by: Record<string, number>
}

export interface Stack {
  /** typescript, javascript, both, or not a node project at all */
  kind: "typescript" | "javascript" | "mixed" | "none"
  /** the dominant language by file count, whatever it is */
  primary: string
  /** what the root manifest calls this project */
  name?: string
  version?: string
  /** the root manifest's or the file beside it, never a vendored one */
  license?: string
  /** a manifest marked private is not meant to be published */
  private: boolean
  /** licence files further down, which belong to bundled third party code */
  vendored: number
  manifests: Manifest[]
  typescript: string[]
  managers: string[]
  lockfiles: string[]
  pinning: Pinning
  dependencies: number
  build: string[]
  frameworks: string[]
  state: string[]
  ui: string[]
  connects: string[]
  testing: string[]
  runtimes: string[]
  styling: string[]
  content: string[]
  /** charts, maps and the drawing libraries */
  visuals: string[]
  observability: string[]
  auth: string[]
  scripts: string[]
  linters: string[]
  formatters: string[]
  rules: string[]
  ci: string[]
  bundlers: string[]
  ports: number[]
  /** where it looks like it deploys */
  hosts: string[]
  /** what it is built into besides a page */
  apps: string[]
  /** node versions asked for, from engines and .nvmrc */
  node: string[]
  /** esm, cjs or both, from package type and file extensions */
  modules: string[]
  /** how many tsconfigs turn strict on, and how many leave it off */
  strict: { on: number; off: number }
  /** files that hint at configuration the repo expects */
  env: string[]
  containers: { dockerfiles: number; compose: number; kubernetes: number; terraform: number }
  apis: string[]
  licenses: string[]
  parts: string[]
  /** label to the dependency that implied it, so a claim can be followed */
  from: Record<string, string>
  /** which registry a label's package lives in, when it is not npm */
  registries: Record<string, string>
  ai: Ai
}

/**
 * on anything that can end up in a file: which desprawl wrote it and what it read.
 * No timestamp, so the same repo read twice writes the same bytes
 */
export interface Made {
  /** the version that wrote it */
  desprawl: string
  /** the repo it was read from, or the folder when one holds several */
  repo: string
}

export const made = (repo: string): Made => ({
  desprawl: VERSION,
  // one spelling of the path, however it was typed on the way in
  repo: repo ? resolve(repo) : "",
})

export interface Stats extends Split {
  version: string // desprawl that wrote this, so a reader knows the shape
  repo: string
  head: string
  commits: number
  /** True when more commits exist than were read, so churn covers a window */
  truncated: boolean
  /** a partial clone holds no file contents, so every line count here is 0 */
  thin: boolean
  contributors: Contributor[]
  /** one row per raw git identity, before names are folded together */
  identities: Contributor[]
  log: Commit[]
  /** Per day, the contributor indices who committed */
  active: number[][]
  remotes: Remote[]
  languages: Node[] // folded, so they carry churn too
  /** tracked files left out as somebody else's code, or by an exclude the reader gave */
  skipped: number
  stack: Stack
  tree: Node
  series: Series[]
  files: number
  chars: number
  insertions: number
  deletions: number
  first: string
  last: string
}

// stderr piped, and quotePath off for umlauts
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 30,
    stdio: "pipe",
  })

// prettier-ignore
export const blank = (name: string, path = ""): Node => ({
  name, path, lang: "", files: 0, chars: 0, code: 0, comment: 0, blank: 0, indent: 0,
  commits: 0, insertions: 0, deletions: 0, last: "", langs: {}, by: {},
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
  for (const [who, n] of Object.entries(f.by))
    into.by[Number(who)] = (into.by[Number(who)] ?? 0) + n
  for (const [lang, loc] of Object.entries(f.langs))
    into.langs[lang] = (into.langs[lang] ?? 0) + loc
}

export const rank = <T extends Bucket>(list: T[]): T[] => list.sort((a, b) => b.code - a.code)

export function fold(files: Node[], key: (f: Node) => string): Node[] {
  const by = new Map<string, Node>()
  for (const f of files) {
    const name = key(f)
    const b = by.get(name) ?? blank(name)
    merge(b, f)
    by.set(name, b)
  }
  return rank([...by.values()])
}

export function grow(files: Node[]): Node {
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
