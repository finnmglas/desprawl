// owner: finn
// goal: what this branch added that the base did not have

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cycles } from "../read/cycles.ts"
import { build } from "../read/graph.ts"
import { made, git, type Made } from "../read/model.ts"
import type { Graph } from "../read/graph.ts"

export interface Count {
  name: string
  was: number
  now: number
  /** what the diff added, never the total: a threshold becomes a target */
  added: number
  /** the ones that are new, named, capped for reading */
  which: string[]
}

export interface Checked extends Made {
  base: string
  head: string
  counts: Count[]
  /** anything at all got worse */
  worse: boolean
}

const CAP = 20

const ring = (loop: string[]) => [...loop].sort().join(" -> ")

/** every measure this compares, each read off one graph */
const read = (graph: Graph) => ({
  cycles: cycles(graph).map(ring),
  unresolved: graph.missing.map((one) => `${one.from} -> ${one.specifier}`),
  barrels: Object.values(graph.modules)
    .filter((one) => one.barrel)
    .map((one) => one.path),
})

const count = (name: string, was: string[], now: string[]): Count => {
  const before = new Set(was)
  const which = now.filter((one) => !before.has(one))
  return { name, was: was.length, now: now.length, added: which.length, which: which.slice(0, CAP) }
}

/**
 * The base ref in a worktree of its own, so both sides are read the same way. Shares the
 * object store, so it costs a checkout rather than a clone.
 */
export function check(repo: string, base: string): Checked {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const at = git(root, "rev-parse", "--short", base).trim()
  if (!at) throw new Error(`no ref called ${base}`)
  const head = git(root, "rev-parse", "--short", "HEAD").trim()

  const where = mkdtempSync(join(tmpdir(), "desprawl-base-"))
  try {
    git(root, "worktree", "add", "--detach", "--quiet", where, at)
    const was = read(build(where))
    const now = read(build(root))
    const counts = [
      count("import cycles", was.cycles, now.cycles),
      count("unresolved imports", was.unresolved, now.unresolved),
      count("barrel files", was.barrels, now.barrels),
    ]
    return { ...made(root), base: at, head, counts, worse: counts.some((one) => one.added > 0) }
  } finally {
    try {
      git(root, "worktree", "remove", "--force", where)
    } catch {
      rmSync(where, { recursive: true, force: true })
    }
  }
}
