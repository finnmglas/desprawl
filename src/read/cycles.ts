// owner: finn
// goal: group cyclic imports issues

import type { Graph } from "./graph.ts"

/** Tarjan, iterative, sinks first: recursion would blow the stack and levelling needs that order */
export function scc(nodes: Iterable<string>, out: (node: string) => string[]): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0

  for (const start of nodes) {
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

export const components = (graph: Graph, { types = true } = {}): string[][] =>
  scc(Object.keys(graph.modules), (path) =>
    graph.modules[path].out.filter((e) => types || !e.type).map((e) => e.to),
  )

/** the tangled ones only, biggest first */
export const cycles = (graph: Graph, options?: { types?: boolean }): string[][] =>
  components(graph, options)
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length)
