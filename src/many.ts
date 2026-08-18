// owner: finn
// goal: a folder of repos read as one, and each of them still read on its own

import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { analyze } from "./analyze.ts"
import { build } from "./graph.ts"
import { calls } from "./calls.ts"
import { near, norm } from "./history.ts"
import { blank, merge, rank, VERSION } from "./model.ts"
import { joined, reading } from "./routes.ts"
import type { Api, Client, Endpoint } from "./routes.ts"
import type { Calls } from "./calls.ts"
import type { Graph } from "./graph.ts"
import type { Commit, Contributor, Node, Series, Stats } from "./model.ts"

/** a folder is a fleet when it is not a repo itself and holds more than one */
export function fleet(path: string): string[] {
  if (existsSync(join(path, ".git"))) return []
  let names: string[] = []
  try {
    names = readdirSync(path)
  } catch {
    return []
  }
  const found = names
    .filter((name) => !name.startsWith("."))
    .map((name) => join(path, name))
    .filter((one) => {
      try {
        return statSync(one).isDirectory() && existsSync(join(one, ".git"))
      } catch {
        return false
      }
    })
  return found.length > 1 ? found.sort() : []
}

const named = (path: string) => path.split("/").filter(Boolean).pop() ?? path

/** every identity across the fleet, one row each, indices remapped per repo */
function people(each: Stats[]): { all: Contributor[]; seats: Map<string, number>[] } {
  const by = new Map<string, Contributor>()
  const seats: Map<string, number>[] = []
  for (const one of each) {
    const seat = new Map<string, number>()
    for (const [i, who] of one.contributors.entries()) {
      // the same address, or a name near enough that one repo would have folded it
      const email = (who.email || who.name).toLowerCase()
      const mine = norm(who.name)
      const key =
        (by.has(email) ? email : "") ||
        [...by].find(([, held]) => near(mine, norm(held.name)))?.[0] ||
        email
      const held = by.get(key)
      if (held) {
        held.commits += who.commits
        held.insertions += who.insertions
        held.deletions += who.deletions
        held.files += who.files
        if (who.first < held.first) held.first = who.first
        if (who.last > held.last) held.last = who.last
        const seen = new Set([...(held.also ?? []), ...(who.also ?? []), who.email])
        seen.delete(held.email)
        held.also = [...seen].filter(Boolean)
      } else {
        by.set(key, { ...who, also: [...(who.also ?? [])] })
      }
      seat.set(String(i), [...by.keys()].indexOf(key))
    }
    seats.push(seat)
  }
  const all = [...by.values()].sort((a, b) => b.commits - a.commits)
  // the sort moved them, so a repo's own index has to find its person again
  const where = new Map(all.map((one, i) => [(one.email || one.name).toLowerCase(), i]))
  const keys = [...by.keys()]
  return {
    all,
    seats: seats.map(
      (seat) =>
        new Map([...seat].map(([from, to]) => [from, where.get(keys[to]) ?? 0])) as Map<
          string,
          number
        >,
    ),
  }
}

/** a repo's tree hung under its own name, with author indices remapped */
function rooted(one: Stats, seat: Map<string, number>): Node {
  const rewrite = (node: Node, under: string): Node => ({
    ...node,
    path: node.path ? `${under}/${node.path}` : under,
    by: Object.fromEntries(
      Object.entries(node.by).map(([who, n]) => [seat.get(who) ?? Number(who), n]),
    ),
    children: node.children?.map((child) => rewrite(child, under)),
  })
  const name = named(one.repo)
  return { ...rewrite(one.tree, name), name, path: name }
}

/** who committed on each day of the fleet's calendar, indices remapped */
function busy(
  each: Stats[],
  seats: Map<string, number>[],
  start: string,
  days: number,
): number[][] {
  const out: number[][] = Array.from({ length: Math.max(days, 0) }, () => [])
  each.forEach((one, i) => {
    const from = one.series[0]?.start
    if (!from) return
    const shift = Math.round((Date.parse(from) - Date.parse(start)) / 86_400_000)
    one.active.forEach((who, day) => {
      const at = shift + day
      if (at < 0 || at >= out.length) return
      for (const index of who) {
        const seat = seats[i].get(String(index)) ?? index
        if (!out[at].includes(seat)) out[at].push(seat)
      }
    })
  })
  return out
}

/** every repo's commits in one list, newest first, authors remapped */
function logs(each: Stats[], seats: Map<string, number>[]): Commit[] {
  const all = each.flatMap((one, i) =>
    one.log.map((commit) => ({ ...commit, who: seats[i].get(String(commit.who)) ?? commit.who })),
  )
  return all.sort((a, b) => b.date.localeCompare(a.date))
}

/** the same metric across repos, laid on one calendar */
function align(each: Stats[]): Series[] {
  const metrics = [...new Set(each.flatMap((one) => one.series.map((s) => s.metric)))]
  const starts = each.flatMap((one) => one.series.map((s) => s.start)).filter(Boolean)
  const ends = each.flatMap((one) => one.series.map((s) => s.end)).filter(Boolean)
  if (!starts.length) return []
  const start = starts.reduce((a, b) => (a < b ? a : b))
  const end = ends.reduce((a, b) => (a > b ? a : b))
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
  return metrics.map((metric) => {
    const data = new Array<number>(Math.max(days, 0)).fill(0)
    for (const one of each) {
      const series = one.series.find((s) => s.metric === metric)
      if (!series) continue
      const from = Math.round((Date.parse(series.start) - Date.parse(start)) / 86_400_000)
      series.data.forEach((n, i) => {
        const at = from + i
        if (at >= 0 && at < data.length) data[at] += n
      })
    }
    return { metric, start, end, granularity: "1d", data }
  })
}

/** every repo in the folder as one set of numbers, each still readable alone */
export function many(path: string, cap?: number): { each: Stats[]; all: Stats } {
  const each = fleet(path).map((one) => analyze(one, cap))
  if (!each.length) throw new Error(`${path} holds no repos to read`)

  const { all: contributors, seats } = people(each)
  const tree = blank("")
  tree.children = each.map((one, i) => rooted(one, seats[i]))
  for (const child of tree.children) merge(tree, child)
  // merge counts a child as one file, and a repo is however many it holds
  tree.files = each.reduce((sum, one) => sum + one.files, 0)

  const languages = new Map<string, Node>()
  for (const one of each)
    for (const lang of one.languages) {
      const held = languages.get(lang.name) ?? blank(lang.name)
      merge(held, lang)
      held.files += lang.files - 1
      languages.set(lang.name, held)
    }

  const { name, path: _p, lang, children, commits, last, ...totals } = tree
  const first = each.map((one) => one.first).reduce((a, b) => (a < b ? a : b))
  const series = align(each)
  return {
    each,
    all: {
      ...each[0],
      version: VERSION,
      repo: path,
      head: `${each.length} repos`,
      commits: each.reduce((sum, one) => sum + one.commits, 0),
      truncated: each.some((one) => one.truncated),
      thin: each.some((one) => one.thin),
      contributors,
      identities: contributors,
      log: logs(each, seats),
      active: busy(each, seats, series[0]?.start ?? first, series[0]?.data.length ?? 0),
      remotes: each.flatMap((one) => one.remotes),
      languages: rank([...languages.values()]),
      tree,
      series,
      first,
      last: each.map((one) => one.last).reduce((a, b) => (a > b ? a : b)),
      ...totals,
    },
  }
}

/** every repo's import graph on one set of keys, prefixed so nothing crosses a repo */
export function graphs(path: string): Graph {
  const all: Graph = {
    modules: {},
    packages: {},
    missing: [],
    stats: { files: 0, edges: 0, external: 0, generated: 0, assets: 0, coverage: 0 },
  }
  const repos = fleet(path)
  for (const one of repos) {
    const under = named(one)
    const graph = build(one)
    const at = (file: string) => `${under}/${file}`
    for (const [file, module] of Object.entries(graph.modules))
      all.modules[at(file)] = {
        ...module,
        path: at(module.path),
        out: module.out.map((edge) => ({ ...edge, to: at(edge.to) })),
        in: module.in.map(at),
      }
    for (const [name, by] of Object.entries(graph.packages))
      all.packages[name] = [...(all.packages[name] ?? []), ...by.map(at)]
    all.missing.push(...graph.missing.map((one) => ({ ...one, from: at(one.from) })))
    all.stats.files += graph.stats.files
    all.stats.edges += graph.stats.edges
    all.stats.external += graph.stats.external
    all.stats.generated += graph.stats.generated
    all.stats.assets += graph.stats.assets
  }
  const asked = all.stats.edges + all.stats.external + all.missing.length
  all.stats.coverage = asked ? (all.stats.edges + all.stats.external) / asked : 1
  return all
}

/** every repo's api, read as one wire: a call in one repo lands on an endpoint in another */
export function everyApi(path: string): Api {
  const endpoints: Endpoint[] = []
  const clients: Client[] = []
  const hosts: string[] = []
  for (const one of fleet(path)) {
    const under = named(one)
    const at = (file: string) => `${under}/${file}`
    const graph = build(one)
    const found = reading(one, graph, calls(one, graph))
    endpoints.push(
      ...found.endpoints.map((held) => ({
        ...held,
        id: at(held.id),
        file: at(held.file),
        handler: held.handler ? at(held.handler) : undefined,
      })),
    )
    clients.push(
      ...found.clients.map((held) => ({ ...held, id: at(held.id), file: at(held.file) })),
    )
    // a host one repo says it serves is that host for every repo beside it
    hosts.push(...found.hosts)
  }
  return joined(endpoints, clients, hosts)
}

/** and every call graph, on the same prefixed keys */
export function everyCall(path: string): Calls {
  const all: Calls = {
    symbols: {},
    unresolved: [],
    // prettier-ignore
    stats: { files: 0, symbols: 0, functions: 0, classes: 0, components: 0, edges: 0, external: 0, builtin: 0, coverage: 0, unresolved: 0, uncalled: 0, lines: 0 },
  }
  for (const one of fleet(path)) {
    const under = named(one)
    const at = (id: string) => `${under}/${id}`
    const found = calls(one)
    for (const [id, symbol] of Object.entries(found.symbols))
      all.symbols[at(id)] = {
        ...symbol,
        id: at(symbol.id),
        file: at(symbol.file),
        calls: symbol.calls.map(at),
        callers: symbol.callers.map(at),
      }
    all.unresolved.push(...found.unresolved.map((one) => ({ ...one, from: one.from.map(at) })))
    for (const key of Object.keys(all.stats) as (keyof Calls["stats"])[])
      if (key !== "coverage") all.stats[key] += found.stats[key]
  }
  const seen = all.stats.edges + all.stats.external + all.stats.builtin + all.stats.unresolved
  all.stats.coverage = seen ? (all.stats.edges + all.stats.external + all.stats.builtin) / seen : 1
  return all
}
