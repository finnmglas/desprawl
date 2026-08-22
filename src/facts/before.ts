// owner: finn
// goal: the repo as it was, read the same way it is read now, so a kpi can say which way it went

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

/** the totals a masthead shows, which no graph carries. Named so a card can hold them
 * against its own numbers by name, whichever ones it happens to show */
export type Sized = Record<"code" | "comment" | "chars" | "files" | "commits", number>

/** what was read, and which commit it was read at */
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

/** the newest commit older than the window, or "" when every commit is newer than it */
function edge(root: string, days: number): { at: string; when: string } {
  const when = new Date(Date.now() - days * 86_400_000).toISOString()
  const at = git(root, "rev-list", "-1", `--before=${when}`, "HEAD").trim()
  return at
    ? { at, when: git(root, "show", "-s", "--format=%cI", at).trim() }
    : { at: "", when: "" }
}

// a checkout is the expensive half, so one per repo and window is held and every reading
// shares it. Two windows at a time: a reader flips back and forth, they do not collect
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
  // a run that died mid way leaves an entry behind, and git will not reuse the path
  try {
    git(root, "worktree", "prune")
  } catch {
    // nothing to prune, or nothing that can be
  }
}

/** every checkout this run made, gone. Called when the process ends, and by the tests */
export function forget(): void {
  for (const key of [...held.keys()]) drop(key)
}

for (const signal of ["exit", "SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    forget()
    if (signal !== "exit") process.exit(0)
  })

/**
 * the repo as it stood, in a throwaway worktree beside it. Every reader here starts with a
 * folder and a git dir, which is exactly what a worktree is, so nothing else had to change
 */
function home(root: string, days: number): { dir: string; at: string; when: string } | null {
  const { at, when } = edge(root, days)
  if (!at) return null
  // keyed by the commit, not by the window: two windows landing on the same commit are one
  // checkout, and a window said twice with a millisecond between is not two of them
  const key = `${root}@${at}`
  const seen = held.get(key)
  if (seen) return seen
  let dir = ""
  try {
    dir = mkdtempSync(join(tmpdir(), "desprawl-was-"))
    // detached, so it takes no branch and leaves none behind
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

/**
 * one reading of an older commit, asked for by name. The caller says what it wants because
 * a call graph costs what a call graph costs, and a masthead never needed one
 */
export function before(repo: string, days: number, want: Want = "size"): Was | null {
  if (!(days > 0)) return null
  let root: string
  try {
    root = git(repo, "rev-parse", "--show-toplevel").trim()
  } catch {
    return null
  }
  const at = home(root, days)
  // a repo that held nothing then: every number grew from zero, which is the honest reading
  if (!at) return want === "size" ? { at: "", when: "", size: nothing } : null
  try {
    if (want === "size") return { ...at, size: sized(at.dir, root, at.at) }
    if (want === "graph") return { ...at, graph: build(at.dir) }
    if (want === "calls") return { ...at, calls: calls(at.dir, build(at.dir)) }
    // the same paths the panel reads today: the modules, not every tracked file
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
    // a bare repo, a submodule, no disk: a card without an arrow beats a card with a guess
    return null
  }
}
