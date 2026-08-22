// owner: finn
// goal: the repo as it was

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { git, grow, made } from "../read/model.ts"
import { scan } from "../read/scan.ts"
import { build, ignored } from "../read/graph.ts"
import { calls } from "../read/calls.ts"
import { copied, repeated, talky } from "./sprawl.ts"
import type { Graph } from "../read/graph.ts"
import type { Calls } from "../read/calls.ts"
import type { Sprawl } from "./work.ts"

/** masthead totals, keyed by name so a card can hold its own against them */
export type Sized = Record<"code" | "comment" | "chars" | "files" | "commits", number>

/** what was read, and at which commit */
export interface Was {
  /** the commit the window opens on, empty when the repo held nothing that far back */
  at: string
  /** and when it landed, so a card can say what it is comparing against */
  when: string
  size?: Sized
  graph?: Graph
  calls?: Calls
  sprawl?: Sprawl
}

export type Want = "size" | "graph" | "calls" | "sprawl"

const nothing: Sized = { code: 0, comment: 0, chars: 0, files: 0, commits: 0 }

/** the newest commit older than the window, "" when there is none */
function edge(root: string, days: number): { at: string; when: string } {
  const when = new Date(Date.now() - days * 86_400_000).toISOString()
  const at = git(root, "rev-list", "-1", `--before=${when}`, "HEAD").trim()
  return at
    ? { at, when: git(root, "show", "-s", "--format=%cI", at).trim() }
    : { at: "", when: "" }
}

// a checkout is the expensive half, so every reading shares one. Two at a time
const MOST = 2
const held = new Map<string, { dir: string; at: string; when: string }>()

function drop(key: string) {
  const one = held.get(key)
  if (!one) return
  held.delete(key)
  const root = key.slice(0, key.lastIndexOf("@"))
  try {
    git(root, "worktree", "remove", "--force", one.dir)
  } catch {
    rmSync(one.dir, { recursive: true, force: true })
  }
  // a dead run leaves an entry, and git will not reuse the path
  try {
    git(root, "worktree", "prune")
  } catch {
    // nothing to prune, or nothing that can be
  }
}

/** every checkout this run made, gone */
export function forget(): void {
  for (const key of [...held.keys()]) drop(key)
}

for (const signal of ["exit", "SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    forget()
    if (signal !== "exit") process.exit(0)
  })

// a run that died left its checkout registered, and prune only clears one whose folder went
const swept = new Set<string>()

function sweep(root: string): void {
  if (swept.has(root)) return
  swept.add(root)
  const mine = new Set([...held.values()].map((one) => one.dir))
  try {
    for (const line of git(root, "worktree", "list", "--porcelain").split("\n")) {
      const dir = line.startsWith("worktree ") ? line.slice(9).trim() : ""
      if (!/(^|\/)desprawl-was-[^/]+$/.test(dir) || mine.has(dir)) continue
      git(root, "worktree", "remove", "--force", dir)
      rmSync(dir, { recursive: true, force: true })
    }
    git(root, "worktree", "prune")
  } catch {
    // whatever is left stays, and the next checkout takes a name of its own
  }
}

/** the repo as it stood, in a throwaway worktree: a folder and a git dir */
function home(root: string, days: number): { dir: string; at: string; when: string } | null {
  const { at, when } = edge(root, days)
  if (!at) return null
  // keyed by the commit: two windows can land on one
  const key = `${root}@${at}`
  const seen = held.get(key)
  if (seen) return seen
  sweep(root)
  let dir = ""
  try {
    dir = mkdtempSync(join(tmpdir(), "desprawl-was-"))
    // detached: no branch either way
    git(root, "worktree", "add", "--detach", "--quiet", dir, at)
  } catch {
    if (dir) rmSync(dir, { recursive: true, force: true })
    return null
  }
  while (held.size >= MOST) drop([...held.keys()][0])
  const made = { dir, at, when }
  held.set(key, made)
  return made
}

const sized = (dir: string, root: string, at: string): Sized => {
  const files = scan(dir, ignored(dir))
  const totals = grow(files)
  return {
    code: totals.code,
    comment: totals.comment,
    chars: totals.chars,
    files: files.length,
    commits: Number(git(root, "rev-list", "--count", at).trim()) || 0,
  }
}

/** one reading, asked for by name: a call graph costs what a call graph costs */
export function before(repo: string, days: number, want: Want = "size"): Was | null {
  if (!(days > 0)) return null
  let root: string
  try {
    root = git(repo, "rev-parse", "--show-toplevel").trim()
  } catch {
    return null
  }
  const at = home(root, days)
  // nothing there then, so every number grew from zero
  if (!at) return want === "size" ? { at: "", when: "", size: nothing } : null
  try {
    if (want === "size") return { ...at, size: sized(at.dir, root, at.at) }
    if (want === "graph") return { ...at, graph: build(at.dir) }
    if (want === "calls") return { ...at, calls: calls(at.dir, build(at.dir)) }
    // the modules, the way the panel reads them
    const paths = Object.keys(build(at.dir).modules)
    return {
      ...at,
      sprawl: {
        ...made(at.dir),
        repeated: repeated(at.dir, paths),
        copied: copied(at.dir, paths),
        talky: talky(at.dir, paths),
      },
    }
  } catch {
    // a bare repo, a submodule, no disk: no arrow beats a guessed one
    return null
  }
}
