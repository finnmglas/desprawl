// owner: finn
// goal: which file serves an http endpoint, and which file calls one

import { made } from "../read/model.ts"
import { collect, nearest, type Found } from "./inside.ts"
import { filled, pathy } from "./rules.ts"
import { VENDORED, build, type Graph } from "./graph.ts"
import { git } from "./model.ts"
import { normal, specs, under } from "./specs.ts"
import type { Api, Client, Endpoint, Link } from "./specs.ts"

export type { Api, Client, Endpoint, Link }
import { calls as callGraph, type Calls } from "./calls.ts"

export { filled, pathy }

const segments = (path: string) => path.split("/").filter(Boolean)

const HOSTLESS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\*[\w.*-]*|[\w-]+\.local)(:\d+)?$/i

/** the call sites and the endpoints matched up, the longest literal run winning */
export function link(endpoints: Endpoint[], clients: Client[], ours: string[] = []): Link[] {
  const own = new Set(ours.map((one) => one.toLowerCase()))
  const held = endpoints.map((one) => ({ one, segs: segments(one.path) }))
  const links: Link[] = []
  for (const client of clients) {
    const want = segments(client.path)
    // a call that names a host is a call to that host, since nothing here knows what this
    // fleet deploys as, unless a spec in it says that host is where the fleet answers
    const host = client.host.replace(/:\d+$/, "").toLowerCase()
    if (host && !HOSTLESS.test(client.host) && !own.has(host)) continue
    let best: { score: number; end: Endpoint; how: Link["how"] } | null = null
    // what a client holds as a base url is leading segments this repo never wrote
    for (let from = 0; from < Math.max(1, Math.min(5, want.length)); from++) {
      const tail = want.slice(from)
      if (!tail.length) break
      for (const { one, segs } of held) {
        const wide = segs.at(-1) === "**"
        if (wide ? tail.length < segs.length - 1 : tail.length !== segs.length) continue
        if (one.method !== "ANY" && client.method !== "ANY" && one.method !== client.method)
          continue
        let literal = 0
        // a value the caller held against a word the route wrote, which is weak evidence
        let loose = 0
        let ok = true
        for (const [i, seg] of segs.entries()) {
          if (seg === "**") break
          const said = tail[i]
          // a parameter of the route takes whatever the caller put there
          if (seg === "*") continue
          if (said === "*") {
            loose++
            continue
          }
          if (seg.toLowerCase() !== said.toLowerCase()) {
            ok = false
            break
          }
          literal++
        }
        if (!ok || !literal || literal < (loose ? 2 : 1)) continue
        const score =
          literal * 4 -
          from -
          (one.method === client.method ? 0 : 1) -
          // a document lists an endpoint, code answers one, so a tie goes to the code
          (one.framework === "openapi" ? 1 : 0)
        if (!best || score > best.score) best = { score, end: one, how: from ? "tail" : "exact" }
      }
      if (best) break
    }
    if (!best) continue
    links.push({
      from: client.file,
      to: best.end.handler ?? best.end.file,
      call: client.id,
      endpoint: best.end.id,
      method: client.method === "ANY" ? best.end.method : client.method,
      path: best.end.path,
      how: best.how,
    })
  }
  return links
}

// `"/flows/" + id + "/"` is one path written in three pieces
function prefixes(found: Found): Map<string, string[]> {
  const into = new Map<string, { prefix: string; from: string }[]>()
  for (const one of found.mounts)
    into.set(one.into, [...(into.get(one.into) ?? []), { prefix: one.prefix, from: one.from }])
  const roots = new Set<string>()
  for (const one of found.mounts) if (!into.has(one.from)) roots.add(one.from)
  for (const one of found.endpoints) if (!into.has(one.file)) roots.add(one.file)
  for (const one of found.registered) if (!into.has(one.file)) roots.add(one.file)
  const held = new Map<string, string[]>()
  const walk = (file: string, prefix: string, seen: Set<string>) => {
    const mine = held.get(file) ?? []
    if (mine.includes(prefix) || mine.length > 4 || seen.has(file)) return
    held.set(file, [...mine, prefix])
    for (const one of found.mounts.filter((m) => m.from === file))
      walk(one.into, under(prefix, one.prefix), new Set([...seen, file]))
  }
  for (const file of roots) walk(file, "", new Set())
  // a file nothing mounts still serves what it holds
  for (const one of [...found.endpoints, ...found.registered])
    if (!held.has(one.file)) held.set(one.file, [""])
  return held
}

/** the endpoints as they answer, prefixes applied and every registered viewset spread out */
function serving(found: Found): Endpoint[] {
  const held = prefixes(found)
  const inFile = new Map<string, { line: number; path: string }[]>()
  for (const one of found.prefixes)
    inFile.set(one.file, [...(inFile.get(one.file) ?? []), { line: one.line, path: one.path }])
  const above = (file: string, line: number) => {
    const mine = (inFile.get(file) ?? []).filter((one) => one.line <= line)
    return mine.at(-1)?.path ?? ""
  }
  const out: Endpoint[] = []
  for (const one of found.endpoints)
    for (const prefix of held.get(one.file) ?? [""]) {
      // a file based route is already the whole path, and nothing mounts it
      const path = one.framework.match(/^(next|sveltekit|nuxt)$/)
        ? one.path
        : under(prefix, above(one.file, one.line), one.path)
      out.push({ ...one, path, id: `${one.file}:${one.line}:${one.method}:${path}` })
    }
  // a viewset is a list, a detail and whatever it adds itself
  for (const one of found.registered) {
    const holders = found.declares.get(one.name) ?? []
    const handler = nearest(holders, one.file)
    for (const prefix of held.get(one.file) ?? [""]) {
      const base = under(prefix, found.routers[`${one.file}#${one.router}`] ?? "", one.prefix)
      const made: [string, string][] = [
        [base, "GET"],
        [base, "POST"],
        [`${base}/*`, "GET"],
        [`${base}/*`, "PUT"],
        [`${base}/*`, "PATCH"],
        [`${base}/*`, "DELETE"],
      ]
      // an action writes its own url, regex and parameters and all
      // and when two files declare that name alike, whatever either of them adds
      const added = handler
        ? (found.actions[`${handler}#${one.name}`] ?? [])
        : holders.flatMap((file) => found.actions[`${file}#${one.name}`] ?? [])
      for (const action of added)
        for (const verb of action.methods)
          made.push([normal(under(base, action.detail ? "*" : "", action.path)).path, verb])
      for (const [path, method] of made)
        out.push({
          id: `${one.file}:${one.line}:${method}:${path}`,
          file: one.file,
          line: one.line,
          method,
          path,
          raw: one.prefix,
          framework: "drf",
          handler,
        })
    }
  }
  return out
}

/** the same route read twice by two patterns is one route, and the named library wins */
const once = <T extends { id: string; framework: string }>(held: T[]): T[] => {
  const by = new Map<string, T>()
  for (const one of held) {
    const seen = by.get(one.id)
    if (!seen || (seen.framework === "http" && one.framework !== "http")) by.set(one.id, one)
  }
  return [...by.values()]
}

/** what a repo serves and what it calls, ready to be matched against anything else */
export function reading(
  repo: string,
  graph: Graph = build(repo),
  // a route names the thing that answers it, and only the call graph knows where that is
  calls: Calls = callGraph(repo, graph),
): Omit<Api, "links" | "stats"> & { hosts: string[]; unread: number } {
  const found = collect(repo, graph, calls)
  // a spec, a collection and a proto file each list endpoints without holding any code
  const said = specs(repo, tracked(repo))
  return {
    ...made(repo),
    endpoints: once([...serving(found), ...said.endpoints]),
    clients: once([...found.clients, ...said.clients]),
    hosts: said.hosts,
    unread: found.unread,
  }
}

/** every file the repo has, since a document is not a module and holds no imports */
function tracked(repo: string): string[] {
  try {
    return git(repo, "ls-files", "-z")
      .split("\0")
      .filter((one) => one && !VENDORED.test(one))
  } catch {
    return []
  }
}

/** one repo's endpoints, its call sites, and every edge between them */
export function api(repo: string, graph?: Graph, calls?: Calls): Api {
  const { endpoints, clients, hosts, unread } = reading(repo, graph, calls)
  return joined(endpoints, clients, hosts, "", unread)
}

/** the same, once several repos have been read into one list */
export function joined(
  endpoints: Endpoint[],
  clients: Client[],
  hosts: string[] = [],
  repo = "",
  unread = 0,
): Api {
  // a document lists an endpoint, code answers one. A frontend holding a snapshot of the
  // backend's spec serves nothing, and letting it stand reverses every edge into it
  const said = (one: Endpoint) => [one.method, one.path].join(" ")
  const answered = new Set(endpoints.filter((one) => one.framework !== "openapi").map(said))
  const held = endpoints.filter((one) => one.framework !== "openapi" || !answered.has(said(one)))
  const described = endpoints.length - held.length
  const links = link(held, clients, hosts)
  const reached = new Set(links.map((one) => one.call))
  return {
    ...made(repo),
    endpoints: held,
    clients,
    links,
    stats: {
      endpoints: held.length,
      described,
      clients: clients.length,
      unread,
      linked: reached.size,
      outside: clients.length - reached.size,
      frameworks: [...new Set([...held, ...clients].map((one) => one.framework))].sort(),
    },
  }
}
