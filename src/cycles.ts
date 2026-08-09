// owner: finn
// goal: group cyclic imports issues

import type { Graph } from "./graph.ts"

/** Tarjan, iterative: a deep file graph would blow the stack on a large repo */
export function components(graph: Graph, { types = true } = {}): string[][] {
  const out = (path: string): string[] =>
    graph.modules[path].out.filter((e) => types || !e.type).map((e) => e.to)

  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0

  for (const start of Object.keys(graph.modules)) {
    if (index.has(start)) continue
    // each frame holds how far through its children it is
    const work: [string, number][] = [[start, 0]]

    while (work.length) {
      const [node, step] = work[work.length - 1]
      if (step === 0) {
        index.set(node, counter)
        low.set(node, counter)
        counter++
        stack.push(node)
        onStack.add(node)
      }

      const kids = out(node)
      if (step < kids.length) {
        work[work.length - 1][1]++
        const kid = kids[step]
        if (!index.has(kid)) work.push([kid, 0])
        else if (onStack.has(kid)) low.set(node, Math.min(low.get(node)!, index.get(kid)!))
        continue
      }

      work.pop()
      if (work.length) {
        const parent = work[work.length - 1][0]
        low.set(parent, Math.min(low.get(parent)!, low.get(node)!))
      }
      if (low.get(node) === index.get(node)) {
        const group: string[] = []
        for (;;) {
          const member = stack.pop()!
          onStack.delete(member)
          group.push(member)
          if (member === node) break
        }
        found.push(group)
      }
    }
  }
  return found
}

/** the tangled ones only, biggest first */
export const cycles = (graph: Graph, options?: { types?: boolean }): string[][] =>
  components(graph, options)
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length)

/** what everything leans on, and what leans on everything */
export function hotspots(graph: Graph, take = 10) {
  const all = Object.values(graph.modules)
  const by = (pick: (m: (typeof all)[number]) => number) =>
    [...all].sort((a, b) => pick(b) - pick(a)).slice(0, take)
  return {
    depended: by((m) => m.in.length).map((m) => ({ path: m.path, count: m.in.length })),
    depending: by((m) => m.out.length).map((m) => ({ path: m.path, count: m.out.length })),
    /** imported by nobody: dead weight, unless it is an entry point */
    unreached: all.filter((m) => !m.in.length).map((m) => m.path),
  }
}
