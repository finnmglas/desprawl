// owner: finn
// goal: shapes and their ops

import { execFileSync } from "node:child_process"

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

// estimate
export const tokens = (chars: number): number => Math.round(chars / 4)

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 30 })

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

export const rank = <T extends Bucket>(list: T[]): T[] => list.sort((a, b) => b.code - a.code)

export function fold(files: Node[], key: (f: Node) => string): Bucket[] {
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
