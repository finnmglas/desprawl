// owner: finn
// goal: what a call graph knows past who calls who

import { scc } from "./cycles.ts"
import type { Calls, Symbol } from "./calls.ts"

/** what a declaration is to the code that runs */
export type Reach = "runs" | "called" | "open" | "dead"

/**
 * Everything the running code can arrive at. The top level of every file is a root
 * since importing it runs it, and an export optionally is one too: nothing here has
 * to call it for something outside to.
 */
export function reached(calls: Calls, exports: boolean): Set<string> {
  const roots = Object.values(calls.symbols)
    .filter((s) => s.kind === "module" || (exports && s.exported))
    .map((s) => s.id)
  const seen = new Set(roots)
  const queue = [...roots]
  while (queue.length)
    for (const to of calls.symbols[queue.pop()!]?.calls ?? [])
      if (!seen.has(to)) {
        seen.add(to)
        queue.push(to)
      }
  return seen
}

/** dead means nothing running here arrives at it, not that it is never mentioned */
export const reachOf = (symbol: Symbol, live: Set<string>): Reach =>
  symbol.kind === "module"
    ? "runs"
    : !live.has(symbol.id)
      ? "dead"
      : symbol.callers.length
        ? "called"
        : "open"

export const REACHES: Record<Reach, { label: string; tone: string; why: string }> = {
  runs: {
    label: "runs",
    tone: "text-muted-foreground",
    why: "the top level of a file, which runs the moment anything imports it",
  },
  called: { label: "called", tone: "", why: "something that runs arrives at it" },
  open: {
    label: "only exported",
    tone: "border-amber-500/60",
    why: "nothing here calls it, so it is for something outside: an entry, a route, a test",
  },
  dead: {
    label: "unreachable",
    tone: "border-red-500/60",
    why: "no path from any file's top level, or any export, arrives at it",
  },
}

/** a name several files declare: the copy, or the abstraction that never happened */
export function twins(calls: Calls): { name: string; files: string[]; lines: number }[] {
  const held = new Map<string, Symbol[]>()
  for (const symbol of Object.values(calls.symbols)) {
    if (symbol.kind === "module") continue
    held.set(symbol.name, [...(held.get(symbol.name) ?? []), symbol])
  }
  return [...held.values()]
    .filter((found) => new Set(found.map((s) => s.file)).size > 1)
    .map((found) => ({
      name: found[0].name,
      files: [...new Set(found.map((s) => s.file))].sort(),
      lines: found.reduce((sum, s) => sum + s.lines, 0),
    }))
    .sort((a, b) => b.files.length - a.files.length || b.lines - a.lines)
}

/** functions that call each other in a ring. A call to itself is never recorded, so every ring spans two */
export const rings = (calls: Calls): string[][] =>
  scc(Object.keys(calls.symbols), (id) => calls.symbols[id]?.calls ?? []).filter(
    (group) => group.length > 1,
  )
