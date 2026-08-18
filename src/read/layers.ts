// owner: finn
// goal: fold imports to units, level them, name the tangles

import { scc } from "./cycles.ts"
import type { Graph } from "./graph.ts"

/** what it is for: config is not architecture */
export type Role = "source" | "test" | "support"

export interface Unit {
  path: string
  role: Role
  files: number
  lines: number
  /** what opening the folder would show */
  spread: number
  /** of those, the subfolders */
  folders: number
  /** declared, over its files */
  exports: number
  functions: number
  classes: number
  /** files that declare nothing and only hand on what they import */
  barrels: number
  /** packages it reaches for */
  packages: number
  /** and which, to trace a service to its module */
  installs: string[]
  /** what it imports, weighed by files */
  out: Record<string, number>
  in: Record<string, number>
  /** of those, the type only ones */
  types: Record<string, number>
  /** of the runtime ones, those landing on a barrel and not the file that declares it */
  glue: Record<string, number>
  /** never leaves it: cohesion */
  internal: number
  /** how deep its dependencies go */
  level: number
  /** martin's instability: 0 depended upon, 1 leans on everything */
  instability: number
  /** its tangle, -1 when alone */
  tangle: number
  /** where the most imports arrive: one file can carry a group's shape */
  loudest: string
  /** the same without it, so a verdict resting on it shows */
  without: { internal: number; out: number; into: number; reach: number }
}

export interface Cut {
  from: string
  to: string
  imports: number
  /** of those, the cheap kind to move */
  types: number
  /** of those, the ones cured by naming the file instead of the barrel */
  glue: number
  /** breaks the loop alone */
  alone: boolean
}

export interface Tangle {
  units: string[]
  edges: number
  /** still a loop without the types */
  runtime: boolean
  /** a file cycle spans these folders too, so it is load order and not just placement */
  deep: boolean
  /** one set that opens the loop, not proven minimal */
  cut: Cut[]
}

export interface Layout {
  units: Unit[]
  levels: number
  tangles: Tangle[]
  /** a real ring, which no grouping invents or hides */
  cycles: string[][]
  /** and the ones levelling cannot explain */
  edges: number
  feedback: number
  /** the depth folded at, 0 when auto picked */
  depth: number
}

const TEST =
  /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|cypress|fixtures?|mocks?|stories)(\/|$)|\.(test|spec|stories)\.[cm]?[jt]sx?$/
const SUPPORT =
  /(^|\/)(scripts?|tools?|config|public|static|assets|examples?|docs?|\.\w+)(\/|$)|\.config\.[cm]?[jt]sx?$|(^|\/)[\w.-]*\.(config|setup|rc)\.[cm]?[jt]sx?$/

/** loose at the root is config */
const LOOSE = /^[^/]+\.[cm]?[jt]sx?$/

export const roleOf = (path: string): Role =>
  TEST.test(path) ? "test" : SUPPORT.test(path) || LOOSE.test(path) ? "support" : "source"

/** the folder it answers to */
export const unitOf = (path: string, depth: number): string => {
  const parts = path.split("/")
  return parts.length <= depth ? path : parts.slice(0, depth).join("/")
}

/** the rest of a folder that has chosen folders below it */
export const LOOSE_FILES = "*"

interface Branch {
  path: string
  /** lines below here, which is what the balance is measured in */
  weight: number
  kids: Branch[]
  files: string[]
}

/** the deepest chosen folder above it, and the heaviest keeps opening */
export function balanced(
  graph: Graph,
  { ideal = 10, least = 4, max = 128, share = 6 } = {},
): Record<string, string> {
  // every repo balances as if it were alone: against a fleet's total weight a small one
  // never opens at all, and reads as the single dot its own folder would never be
  if (graph.repos?.length) {
    const all: Record<string, string> = {}
    for (const repo of graph.repos) {
      const under = `${repo}/`
      // the repo's own name comes off first, so a repo folds exactly as it does alone
      const mine = Object.fromEntries(
        Object.entries(graph.modules)
          .filter(([path]) => path.startsWith(under))
          .map(([path, module]) => [
            path.slice(under.length),
            { ...module, path: module.path.slice(under.length) },
          ]),
      )
      if (!Object.keys(mine).length) continue
      const held = balanced({ ...graph, modules: mine, repos: [] }, { ideal, least, max, share })
      for (const [file, group] of Object.entries(held)) all[under + file] = under + group
    }
    return all
  }

  // a file is one node however long it is, and both matter
  const files = Object.keys(graph.modules).length || 1
  const lines = Object.values(graph.modules).reduce((sum, m) => sum + m.lines, 0) || 1
  const weight = (module?: { lines: number }) =>
    module ? 0.5 * (1 / files) + 0.5 * (module.lines / lines) : 0

  const root: Branch = { path: "", weight: 0, kids: [], files: [] }
  const branches = new Map<string, Branch>([["", root]])
  for (const module of Object.values(graph.modules)) {
    let at = root
    at.weight += weight(module)
    for (const step of module.path.split("/").slice(0, -1)) {
      const path = at.path ? `${at.path}/${step}` : step
      let next = branches.get(path)
      if (!next)
        (branches.set(path, (next = { path, weight: 0, kids: [], files: [] })), at.kids.push(next))
      at = next
      at.weight += weight(module)
    }
    at.files.push(module.path)
  }

  // sweeping top folders together invents loops
  const chosen = new Set<string>(["", ...root.kids.map((kid) => kid.path)])
  /** the deepest chosen folder at or above a branch, which is the group it feeds */
  const owner = (path: string): string => {
    for (let at = path; ;) {
      if (chosen.has(at)) return at
      const up = at.lastIndexOf("/")
      at = up === -1 ? "" : at.slice(0, up)
    }
  }
  const own = (branch: Branch) =>
    branch.files.reduce((sum, path) => sum + weight(graph.modules[path]), 0)

  const weigh = () => {
    const held = new Map<string, number>([...chosen].map((path) => [path, 0]))
    for (const branch of branches.values()) {
      const group = owner(branch.path)
      held.set(group, (held.get(group) ?? 0) + own(branch))
    }
    return held
  }

  const goal = root.weight / ideal
  const stuck = new Set<string>()
  while (chosen.size < max) {
    const held = weigh()
    const open = [...held].filter(([path]) => !stuck.has(path))
    if (!open.length) break
    const [worst, weight] = open.reduce((a, b) => (b[1] > a[1] ? b : a))
    if (chosen.size >= least && weight <= goal) break

    // all at once, or peeling leaves the parent just as heavy
    const inside = [...branches.values()].filter(
      (branch) => branch.path && !chosen.has(branch.path) && owner(branch.path) === worst,
    )
    const parts = inside
      .filter((b) => !inside.some((o) => o !== b && b.path.startsWith(`${o.path}/`)))
      // a child too small stays in what is left of its parent
      .filter((branch) => branch.weight >= goal / share)
    // a group of nothing but its own files cannot be opened any further
    if (!parts.length || chosen.size + parts.length > max) {
      stuck.add(worst)
      continue
    }
    for (const part of parts) chosen.add(part.path)
  }

  // a folder with chosen folders under it only holds what is left, and says so
  const deeper = new Set(
    [...chosen].filter((path) => [...chosen].some((other) => other.startsWith(`${path}/`))),
  )
  const name = (path: string) =>
    deeper.has(path) || !path ? `${path ? `${path}/` : ""}${LOOSE_FILES}` : path

  const assign: Record<string, string> = {}
  for (const branch of branches.values())
    for (const file of branch.files) assign[file] = name(owner(branch.path))
  return assign
}

export function fold(graph: Graph, at: number | Record<string, string>): Layout {
  const depth = typeof at === "number" ? at : 0
  const keyOf = (path: string) =>
    typeof at === "number" ? unitOf(path, at) : (at[path] ?? unitOf(path, 1))
  const units = new Map<string, Unit>()
  const seen = (path: string): Unit => {
    let unit = units.get(path)
    if (!unit)
      units.set(
        path,
        (unit = {
          path,
          role: "source",
          files: 0,
          lines: 0,
          spread: 0,
          folders: 0,
          exports: 0,
          functions: 0,
          classes: 0,
          barrels: 0,
          packages: 0,
          installs: [],
          out: {},
          in: {},
          types: {},
          glue: {},
          internal: 0,
          level: 0,
          instability: 0,
          tangle: -1,
          loudest: "",
          without: { internal: 0, out: 0, into: 0, reach: 0 },
        }),
      )
    return unit
  }

  const reached = new Map<string, Set<string>>()
  const roles = new Map<string, Record<Role, number>>()
  const entries = new Map<string, Map<string, boolean>>()
  for (const module of Object.values(graph.modules)) {
    const from = seen(keyOf(module.path))
    const tally = roles.get(from.path) ?? { source: 0, test: 0, support: 0 }
    tally[roleOf(module.path)]++
    roles.set(from.path, tally)
    // named for the folder it is the rest of
    const under = from.path.replace(/\/?\*$/, "")
    const rest =
      under && module.path.startsWith(`${under}/`)
        ? module.path.slice(under.length + 1)
        : module.path
    const listed = entries.get(from.path) ?? new Map<string, boolean>()
    const cut = rest.indexOf("/")
    listed.set(cut === -1 ? rest : rest.slice(0, cut), cut !== -1)
    entries.set(from.path, listed)
    from.files++
    from.lines += module.lines
    from.exports += module.symbols.exports
    from.functions += module.symbols.functions
    from.classes += module.symbols.classes
    if (module.barrel) from.barrels++
    const packages = reached.get(from.path) ?? new Set()
    for (const name of module.packages) packages.add(name)
    reached.set(from.path, packages)
    for (const edge of module.out) {
      const to = keyOf(edge.to)
      if (to === from.path) {
        from.internal++
        continue
      }
      from.out[to] = (from.out[to] ?? 0) + 1
      if (edge.type) from.types[to] = (from.types[to] ?? 0) + 1
      if (!edge.type && graph.modules[edge.to]?.barrel) from.glue[to] = (from.glue[to] ?? 0) + 1
      const target = seen(to)
      target.in[from.path] = (target.in[from.path] ?? 0) + 1
    }
  }

  for (const unit of units.values()) {
    const listed = entries.get(unit.path)
    unit.spread = listed?.size ?? 0
    unit.folders = listed ? [...listed.values()].filter(Boolean).length : 0
    unit.installs = [...(reached.get(unit.path) ?? [])]
    unit.packages = unit.installs.length
    const tally = roles.get(unit.path)
    if (tally)
      unit.role = (Object.keys(tally) as Role[]).reduce((a, b) => (tally[b] > tally[a] ? b : a))
    const leaving = Object.keys(unit.out).length
    const arriving = Object.keys(unit.in).length
    unit.instability = leaving + arriving ? leaving / (leaving + arriving) : 0
  }

  // one file everything imports can decide a group's shape
  const inside = new Map<string, string[]>()
  for (const path of Object.keys(graph.modules)) {
    const group = keyOf(path)
    inside.set(group, [...(inside.get(group) ?? []), path])
  }
  for (const unit of units.values()) {
    const files = inside.get(unit.path) ?? []
    if (files.length < 2) continue
    const pull = (path: string) =>
      graph.modules[path].in.filter((from) => keyOf(from) !== unit.path).length
    unit.loudest = files.reduce((a, b) => (pull(b) > pull(a) ? b : a))
    if (!pull(unit.loudest)) {
      unit.loudest = ""
      continue
    }
    const reach = new Set<string>()
    for (const path of files) {
      if (path === unit.loudest) continue
      for (const edge of graph.modules[path].out) {
        const to = keyOf(edge.to)
        if (!graph.modules[edge.to]) continue
        if (to === unit.path) {
          if (edge.to !== unit.loudest) unit.without.internal++
        } else {
          unit.without.out++
          reach.add(to)
        }
      }
      for (const from of graph.modules[path].in) if (keyOf(from) !== unit.path) unit.without.into++
    }
    unit.without.reach = reach.size
  }

  // an import that only carries a type is gone by the time anything runs
  const runs = (path: string) =>
    Object.keys(seen(path).out).filter((to) => seen(path).out[to] > (seen(path).types[to] ?? 0))
  // the loop a unit still sits in, 1 for none
  const still = new Map<string, number>()
  for (const group of scc(units.keys(), runs))
    for (const path of group) still.set(path, group.length)

  // contracting a graph hides cycles and invents them, so file rings are kept
  const cycles: string[][] = []
  const across: Set<string>[] = []
  for (const group of scc(Object.keys(graph.modules), (path) =>
    graph.modules[path].out.filter((e) => !e.type && graph.modules[e.to]).map((e) => e.to),
  )) {
    if (group.length < 2) continue
    cycles.push([...group].sort())
    const spans = new Set(group.map(keyOf))
    if (spans.size > 1) across.push(spans)
  }
  cycles.sort((a, b) => b.length - a.length)

  const groups = scc(units.keys(), (path) => Object.keys(seen(path).out))
  const level = new Map<string, number>()
  const tangles: Tangle[] = []
  // sinks first, so targets already have levels
  for (const group of groups) {
    const inside = new Set(group)
    let deepest = -1
    for (const member of group)
      for (const target of Object.keys(seen(member).out))
        if (!inside.has(target)) deepest = Math.max(deepest, level.get(target) ?? 0)
    for (const member of group) level.set(member, deepest + 1)

    if (group.length < 2) continue
    const id = tangles.length
    let edges = 0
    for (const member of group) {
      seen(member).tangle = id
      for (const target of Object.keys(seen(member).out)) if (inside.has(target)) edges++
    }
    tangles.push({
      units: [...group].sort(),
      edges,
      // some part of it survives without the types, so it is a real load order loop
      runtime: group.some((member) => (still.get(member) ?? 1) > 1),
      deep: across.some((spans) => [...spans].filter((u) => inside.has(u)).length > 1),
      cut: cut(group, (p) => Object.keys(seen(p).out))
        .map(([from, to]) => ({
          from,
          to,
          imports: seen(from).out[to],
          types: seen(from).types[to] ?? 0,
          glue: seen(from).glue[to] ?? 0,
          alone: opens(group, (p) => Object.keys(seen(p).out), [from, to]),
        }))
        // cheap first: a type or a barrel is a move, the rest a refactor
        .sort(
          (a, b) =>
            (b.types + b.glue) / b.imports - (a.types + a.glue) / a.imports ||
            a.imports - b.imports,
        ),
    })
  }

  let edges = 0
  let feedback = 0
  for (const unit of units.values()) {
    unit.level = level.get(unit.path) ?? 0
    for (const target of Object.keys(unit.out)) {
      edges++
      // only a tangle climbs
      if (unit.tangle >= 0 && seen(target).tangle === unit.tangle) feedback++
    }
  }

  return {
    units: [...units.values()].sort((a, b) => b.level - a.level || a.path.localeCompare(b.path)),
    levels: Math.max(0, ...level.values()) + 1,
    tangles: tangles.sort((a, b) => b.units.length - a.units.length),
    cycles,
    edges,
    feedback,
    depth,
  }
}

/** whether dropping one already splits the group */
function opens(group: string[], out: (path: string) => string[], edge: [string, string]): boolean {
  const inside = new Set(group)
  const left = scc(group, (path) =>
    out(path).filter((to) => inside.has(to) && !(path === edge[0] && to === edge[1])),
  )
  return left.every((part) => part.length < group.length)
}

/** Eades, Lin and Smyth: sources front, sinks back, what points back is the cut */
function cut(group: string[], out: (path: string) => string[]): [string, string][] {
  const inside = new Set(group)
  const to = new Map(group.map((u) => [u, out(u).filter((v) => inside.has(v) && v !== u)]))
  const from = new Map(group.map((u) => [u, [] as string[]]))
  for (const [u, targets] of to) for (const v of targets) from.get(v)!.push(u)

  const live = new Set(group)
  const leaving = new Map(group.map((u) => [u, to.get(u)!.length]))
  const arriving = new Map(group.map((u) => [u, from.get(u)!.length]))
  const drop = (u: string) => {
    live.delete(u)
    for (const v of to.get(u)!) if (live.has(v)) arriving.set(v, arriving.get(v)! - 1)
    for (const v of from.get(u)!) if (live.has(v)) leaving.set(v, leaving.get(v)! - 1)
  }

  const head: string[] = []
  const tail: string[] = []
  while (live.size) {
    let took = true
    while (took) {
      took = false
      for (const u of [...live]) {
        if (!leaving.get(u)) tail.unshift(u)
        else if (!arriving.get(u)) head.push(u)
        else continue
        drop(u)
        took = true
      }
    }
    if (!live.size) break
    // gives most, takes least: earliest
    let best = ""
    let score = -Infinity
    for (const u of live) {
      const gap = leaving.get(u)! - arriving.get(u)!
      if (gap > score) [score, best] = [gap, u]
    }
    head.push(best)
    drop(best)
  }

  const rank = new Map([...head, ...tail].map((u, i) => [u, i]))
  const back: [string, string][] = []
  for (const [u, targets] of to)
    for (const v of targets) if (rank.get(u)! > rank.get(v)!) back.push([u, v])
  return back
}
