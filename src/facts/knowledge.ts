// owner: finn
// goal: the graphs as typed things and typed relations, for whatever reads them next

import { REGISTRY_BY_LANG } from "./registries.ts"
import type { Made } from "../read/model.ts"
import { unitOf } from "../read/layers.ts"
import type { Calls } from "../read/calls.ts"
import type { Graph } from "../read/graph.ts"
import type { Layout } from "../read/layers.ts"

/** how fine the things are, which is the one word a thing of that grain is called */
export const GRAINS = ["module", "file", "declaration"] as const
export type Grain = (typeof GRAINS)[number]

/** what the declaration grain was called before it was named after what it holds */
export const grainOf = (said: string): Grain | "" =>
  said === "function" ? "declaration" : GRAINS.includes(said as Grain) ? (said as Grain) : ""

export interface Thing {
  id: string
  /** the same word as the grain it was read at, and package for what it installs */
  kind: Grain | "package"
  label: string
  /** the language it was read as, so a polyglot repo can be taken apart again */
  lang: string
  /** the thing holding it: the tree, said once, rather than as a link as well */
  inside: string
  lines: number
}

export interface Link {
  from: string
  to: string
  /** what one thing does to another, never what holds it: that is Thing.inside */
  kind: "imports" | "calls" | "installs"
  weight: number
}

export interface Knowledge extends Made {
  repo: string
  grain: Grain
  things: Thing[]
  links: Link[]
}

/** the graphs to read and what to read them at. This runs in a browser too, so nothing
 * here reaches disk: build() and layers() are the caller's to run */
export interface Asking {
  graph: Graph
  layout: Layout
  /** null when the call graph is not wanted, or not read yet */
  calls?: Calls | null
  grain?: Grain
  /** the depth folders are grouped at, or a path to group map */
  split?: number | Record<string, string>
}

/** the graphs as typed things and relations, for whatever reads them next */
export function knowledge(repo: string, asking: Asking): Knowledge {
  const { graph, layout } = asking
  const calls = asking.calls ?? null
  const grain = asking.grain ?? "module"
  const split = asking.split ?? 1
  const unitAt = (path: string) =>
    typeof split === "number" ? unitOf(path, split) : (split[path] ?? unitOf(path, 1))
  // a module is written in whatever most of its files are
  const spoken = new Map<string, Map<string, number>>()
  for (const module of Object.values(graph.modules)) {
    const held = spoken.get(unitAt(module.path)) ?? new Map<string, number>()
    held.set(module.lang, (held.get(module.lang) ?? 0) + 1)
    spoken.set(unitAt(module.path), held)
  }
  const langOf = (unit: string): string =>
    [...(spoken.get(unit) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""

  const things: Thing[] = []
  const links: Link[] = []
  const held = new Set<string>()
  const keep = (thing: Thing) => {
    if (held.has(thing.id)) return
    held.add(thing.id)
    things.push(thing)
  }

  for (const unit of layout.units)
    keep({
      id: unit.path,
      kind: "module",
      label: unit.path,
      lang: langOf(unit.path),
      inside: "",
      lines: unit.lines,
    })

  const files = grain !== "module"
  if (files)
    for (const module of Object.values(graph.modules)) {
      const unit = unitAt(module.path)
      // a shallow file is already its own unit, and nothing contains itself
      if (unit === module.path) continue
      keep({
        id: module.path,
        kind: "file",
        label: module.path.split("/").pop() ?? module.path,
        lang: module.lang,
        inside: unit,
        lines: module.lines,
      })
    }

  if (grain === "declaration")
    for (const one of Object.values(calls?.symbols ?? {})) {
      if (one.kind === "module" || !graph.modules[one.file]) continue
      keep({
        id: one.id,
        kind: "declaration",
        label: one.name,
        lang: one.lang,
        inside: one.file,
        lines: one.lines,
      })
    }

  // an install is a thing too, named for where it is published rather than always npm
  const asked = new Map<string, string>()
  for (const module of Object.values(graph.modules))
    for (const name of module.packages) if (!asked.has(name)) asked.set(name, module.lang)
  const where = (name: string): string => {
    const lang = asked.get(name) ?? ""
    return REGISTRY_BY_LANG[lang] || lang || "npm"
  }
  for (const name of Object.keys(graph.packages))
    keep({
      id: `${where(name)}:${name}`,
      kind: "package",
      label: name,
      lang: asked.get(name) ?? "",
      inside: "",
      lines: 0,
    })
  for (const module of Object.values(graph.modules))
    for (const name of module.packages)
      links.push({
        from: files ? module.path : unitAt(module.path),
        to: `${where(name)}:${name}`,
        kind: "installs",
        weight: 1,
      })

  const at = (path: string) => (files ? path : unitAt(path))
  for (const module of Object.values(graph.modules))
    for (const edge of module.out) {
      const from = at(module.path)
      const to = at(edge.to)
      if (from !== to) links.push({ from, to, kind: "imports", weight: 1 })
    }

  // a file's top level is the file, not a declaration
  const idOf = (one: { id: string; file: string; kind: string }) =>
    one.kind === "module" ? one.file : one.id
  for (const one of Object.values(calls?.symbols ?? {}))
    for (const target of one.calls) {
      const other = calls?.symbols[target]
      if (!other || !graph.modules[one.file] || !graph.modules[other.file]) continue
      const from = grain === "declaration" ? idOf(one) : at(one.file)
      const to = grain === "declaration" ? idOf(other) : at(other.file)
      if (from !== to) links.push({ from, to, kind: "calls", weight: 1 })
    }

  // one line per pair and sort, carrying how many of them there were
  const merged = new Map<string, Link>()
  for (const link of links) {
    const key = `${link.kind} ${link.from} ${link.to}`
    const found = merged.get(key)
    if (found) found.weight++
    else merged.set(key, { ...link })
  }
  // the graph it was built from already says which desprawl read it, and from where
  return {
    desprawl: asking.graph.desprawl,
    repo: asking.graph.repo || repo,
    grain,
    things,
    links: [...merged.values()],
  }
}

/** the same thing as rows, for whatever opens a table rather than a document */
export const asRows = (found: Knowledge): (string | number)[][] => [
  ["kind", "id", "label", "lang", "inside", "lines", "to", "weight"],
  ...found.things.map((one) => [
    one.kind,
    one.id,
    one.label,
    one.lang,
    one.inside,
    one.lines,
    "",
    "",
  ]),
  ...found.links.map((one) => [one.kind, one.from, "", "", "", "", one.to, one.weight]),
]
