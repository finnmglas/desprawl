// owner: finn
// goal: the graphs as typed things and typed relations, for whatever reads them next

import { unitOf } from "../../src/layers.ts"
import type { Calls } from "../../src/calls.ts"
import type { Graph } from "../../src/graph.ts"
import type { Layout } from "../../src/layers.ts"
import type { Grain } from "./network.ts"

export interface Thing {
  id: string
  sort: "module" | "file" | "declaration" | "package"
  label: string
  /** the thing holding it, so the whole is a tree with edges across it */
  inside: string
  lines: number
}

export interface Link {
  from: string
  to: string
  /** contains is the tree, imports and calls are the graph over it */
  sort: "contains" | "imports" | "calls" | "installs"
  weight: number
}

export interface Knowledge {
  repo: string
  grain: Grain
  things: Thing[]
  links: Link[]
}

/**
 * Everything desprawl knows at this grain, as things and relations. The same graphs the
 * tabs draw, in a shape something else can read: nothing here a panel does not show.
 */
export function knowledge(
  repo: string,
  graph: Graph,
  calls: Calls | null,
  layout: Layout,
  grain: Grain,
  split: number | Record<string, string>,
): Knowledge {
  const unitAt = (path: string) =>
    typeof split === "number" ? unitOf(path, split) : (split[path] ?? unitOf(path, 1))
  const things: Thing[] = []
  const links: Link[] = []
  const held = new Set<string>()
  const keep = (thing: Thing) => {
    if (held.has(thing.id)) return
    held.add(thing.id)
    things.push(thing)
  }

  for (const unit of layout.units)
    keep({ id: unit.path, sort: "module", label: unit.path, inside: "", lines: unit.lines })

  const files = grain !== "module"
  if (files)
    for (const module of Object.values(graph.modules)) {
      const unit = unitAt(module.path)
      keep({
        id: module.path,
        sort: "file",
        label: module.path.split("/").pop() ?? module.path,
        inside: unit,
        lines: module.lines,
      })
      links.push({ from: unit, to: module.path, sort: "contains", weight: 1 })
    }

  if (grain === "function")
    for (const one of Object.values(calls?.symbols ?? {})) {
      if (one.kind === "module" || !graph.modules[one.file]) continue
      keep({
        id: one.id,
        sort: "declaration",
        label: one.name,
        inside: one.file,
        lines: one.lines,
      })
      links.push({ from: one.file, to: one.id, sort: "contains", weight: 1 })
    }

  // an install is a thing too: it is what a module leans on that nobody here wrote
  for (const name of Object.keys(graph.packages))
    keep({ id: `npm:${name}`, sort: "package", label: name, inside: "", lines: 0 })
  for (const module of Object.values(graph.modules))
    for (const name of module.packages)
      links.push({
        from: files ? module.path : unitAt(module.path),
        to: `npm:${name}`,
        sort: "installs",
        weight: 1,
      })

  const at = (path: string) => (files ? path : unitAt(path))
  for (const module of Object.values(graph.modules))
    for (const edge of module.out) {
      const from = at(module.path)
      const to = at(edge.to)
      if (from !== to) links.push({ from, to, sort: "imports", weight: 1 })
    }

  // a file's top level is not a declaration, it is the file: a call from it is a call from there
  const idOf = (one: { id: string; file: string; kind: string }) =>
    one.kind === "module" ? one.file : one.id
  for (const one of Object.values(calls?.symbols ?? {}))
    for (const target of one.calls) {
      const other = calls?.symbols[target]
      if (!other || !graph.modules[one.file] || !graph.modules[other.file]) continue
      const from = grain === "function" ? idOf(one) : at(one.file)
      const to = grain === "function" ? idOf(other) : at(other.file)
      if (from !== to) links.push({ from, to, sort: "calls", weight: 1 })
    }

  // one line per pair and sort, carrying how many of them there were
  const merged = new Map<string, Link>()
  for (const link of links) {
    const key = `${link.sort} ${link.from} ${link.to}`
    const found = merged.get(key)
    if (found) found.weight++
    else merged.set(key, { ...link })
  }
  return { repo, grain, things, links: [...merged.values()] }
}

/** the same thing as rows, for whatever opens a table rather than a document */
export const asRows = (found: Knowledge): (string | number)[][] => [
  ["kind", "id", "label", "inside", "lines", "to", "relation", "weight"],
  ...found.things.map((one) => [one.sort, one.id, one.label, one.inside, one.lines, "", "", ""]),
  ...found.links.map((one) => ["link", one.from, "", "", "", one.to, one.sort, one.weight]),
]
