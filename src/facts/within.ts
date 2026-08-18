// owner: finn
// goal: some of a folder, read back out of what was read for all of it

import type { Api } from "../read/routes.ts"
import type { Calls } from "../read/calls.ts"
import type { Graph } from "../read/graph.ts"

/** a fleet path is its repo's name and then the path inside it */
const under = (names: string[]) => {
  const held = names.map((one) => `${one}/`)
  return (path: string) => held.some((one) => path.startsWith(one))
}

/** what a set of repos came to, summed from what each of them came to alone */
const summed = <T extends Record<string, number>>(
  by: Record<string, T> | undefined,
  names: string[],
  fallback: T,
): T => {
  const mine = names.map((one) => by?.[one]).filter(Boolean) as T[]
  if (mine.length !== names.length) return fallback
  const out = { ...mine[0] }
  for (const one of mine.slice(1))
    for (const key of Object.keys(out) as (keyof T)[])
      (out[key] as number) = (out[key] as number) + (one[key] as number)
  return out
}

/** the import graph of some of the repos in a folder */
export function graphIn(graph: Graph, names: string[]): Graph {
  if (!graph.repos?.length) return graph
  const mine = under(names)
  const modules: Graph["modules"] = {}
  for (const [path, module] of Object.entries(graph.modules))
    if (mine(path))
      modules[path] = {
        ...module,
        out: module.out.filter((edge) => mine(edge.to)),
        in: module.in.filter(mine),
      }
  const packages: Graph["packages"] = {}
  for (const [name, by] of Object.entries(graph.packages)) {
    const held = by.filter(mine)
    if (held.length) packages[name] = held
  }
  const missing = graph.missing.filter((one) => mine(one.from))
  const stats = summed(graph.by, names, graph.stats)
  return {
    ...graph,
    modules,
    packages,
    missing,
    repos: names,
    stats: { ...stats, coverage: stats.seen ? (stats.seen - missing.length) / stats.seen : 1 },
  }
}

/** and the call graph, on the same names */
export function callsIn(calls: Calls, names: string[]): Calls {
  const mine = under(names)
  const symbols: Calls["symbols"] = {}
  for (const [id, symbol] of Object.entries(calls.symbols))
    if (mine(symbol.file))
      symbols[id] = {
        ...symbol,
        calls: symbol.calls.filter(mine),
        callers: symbol.callers.filter(mine),
      }
  const unresolved = calls.unresolved
    .map((one) => ({ ...one, from: one.from.filter(mine) }))
    .filter((one) => one.from.length)
  return { ...calls, symbols, unresolved, stats: summed(calls.by, names, calls.stats) }
}

/** the api, which is the one graph that crosses a repo */
export function apiIn(api: Api, names: string[]): Api {
  const mine = under(names)
  return {
    ...api,
    endpoints: api.endpoints.filter((one) => mine(one.file)),
    clients: api.clients.filter((one) => mine(one.file)),
    links: api.links.filter((one) => mine(one.from) && mine(one.to)),
  }
}
