// owner: finn
// goal: every panel the ui draws, as lines a terminal or an agent can read

import { made } from "../read/model.ts"
import { analyze } from "./analyze.ts"
import { timeline } from "./samples.ts"
import { GRAINS, asRows, knowledge, type Grain } from "./knowledge.ts"
import { LANGUAGES, onlyIn } from "../read/dialects.ts"
import { calls as callGraph } from "../read/calls.ts"
import { deps as depsOf } from "./deps.ts"
import { build } from "../read/graph.ts"
import { balanced, fold } from "../read/layers.ts"
import { reachOf, reached } from "../read/reach.ts"
import { everyApi, fleet } from "./many.ts"
import { api as apiOf } from "../read/routes.ts"
import { copied, repeated, talky } from "./sprawl.ts"
import { wall } from "./system.ts"
import { human } from "./human.ts"
import { KINDS, IMPACTS, tasks, weigh, type Hits, type Sort, type Task } from "./work.ts"
import type { Calls } from "../read/calls.ts"
import type { Graph } from "../read/graph.ts"
import type { Layout } from "../read/layers.ts"

export const VIEWS = [
  "tasks",
  "architecture",
  "modules",
  "execution",
  "deps",
  "api",
  "stack",
  "sprawl",
  "history",
  "knowledge",
] as const
export type View = (typeof VIEWS)[number]

export interface Asked {
  kind?: string
  impact?: string
  limit?: number
  json?: boolean
  /** skip the two network reads, which are most of the wait on a large repo */
  offline?: boolean
  /** module, file or declaration, for the knowledge graph */
  grain?: string
  /** one dialect of a mixed repo, since a graph of all of them is several pictures */
  lang?: string
}

const n = (v: number) => human(v, 3)

/** padded columns, the same shape the report uses, minus the totals row */
function grid(rows: (string | number)[][]): string {
  const said = rows.map((r) => r.map(String))
  const wide = said[0].map((_, i) => Math.max(...said.map((r) => r[i].length)))
  return said
    .map((r) => r.map((c, i) => (i ? c.padStart(wide[i]) : c.padEnd(wide[0]))).join("  "))
    .join("\n")
}

const cut = (s: string, to: number) => (s.length > to ? `${s.slice(0, to - 1)}…` : s)

interface Read {
  repo: string
  graph: Graph
  split: ReturnType<typeof balanced>
  calls: Calls
  layout: Layout
  lines: Map<string, number>
}

const readIn = (repo: string, only = ""): Read => {
  const whole = build(repo)
  const graph = only ? onlyIn(whole, only) : whole
  const split = balanced(graph)
  return {
    repo,
    graph,
    split,
    calls: callGraph(repo, graph),
    layout: fold(graph, split),
    lines: new Map(Object.values(graph.modules).map((m) => [m.path, m.lines])),
  }
}

/** what a task is, as one object: the same fields the panel shows */
const asked = (found: Task[], ask: Asked) => {
  let held = found
  if (ask.kind) held = held.filter((one) => one.kind === ask.kind)
  if (ask.impact) held = held.filter((one) => one.hits === ask.impact)
  return ask.limit ? held.slice(0, ask.limit) : held
}

async function work(repo: string, ask: Asked): Promise<{ text: string; data: unknown }> {
  const read = readIn(repo, ask.lang ?? "")
  const kit = ask.offline ? null : await depsOf(repo).catch(() => null)
  const paths = [...read.lines.keys()]
  const said = {
    repeated: repeated(repo, paths),
    copied: copied(repo, paths),
    talky: talky(repo, paths),
    ...made(read.repo),
  }
  const found = asked(tasks(read.layout, read.calls, kit, read.lines, read.graph, said), ask)
  const minutes = found.reduce((sum, one) => sum + one.minutes, 0)
  const text = found.length
    ? [
        grid([
          ["TASK", "FOUND BY", "IMPACT", "CLEARS", "LINES", "EST", "WHERE"],
          ...found.map((one) => [
            cut(one.title, 52),
            one.kind,
            one.hits,
            n(one.reach),
            n(one.lines),
            `${one.minutes}m`,
            cut(one.where, 34),
          ]),
        ]),
        `\n${found.length} tasks, about ${Math.round(minutes / 6) / 10}h of an agent` +
          (ask.offline ? ". Offline, so nothing was read about the dependencies" : ""),
      ].join("\n")
    : "nothing to do here"
  return { text, data: found }
}

function units(read: Read) {
  const rows = read.layout.units
    .filter((one) => one.role === "source")
    .sort((a, b) => b.lines - a.lines)
  return {
    text: grid([
      ["MODULE", "FILES", "LINES", "LEVEL", "SPREAD", "KEPT", "LEAVES", "ARRIVES", "TANGLE"],
      ...rows.map((one) => [
        cut(one.path, 40),
        n(one.files),
        n(one.lines),
        one.level,
        one.spread,
        one.internal,
        Object.keys(one.out).length,
        Object.keys(one.in).length,
        one.tangle < 0 ? "-" : one.tangle,
      ]),
    ]),
    data: rows,
  }
}

function runs(read: Read) {
  const live = reached(read.calls, true)
  const held = Object.values(read.calls.symbols).filter((one) => one.kind !== "module")
  const by = new Map<string, number>()
  for (const one of held) by.set(reachOf(one, live), (by.get(reachOf(one, live)) ?? 0) + 1)
  const hot = [...held].sort((a, b) => b.callers.length - a.callers.length).slice(0, 20)
  return {
    text: [
      `${n(held.length)} declarations, ${n(read.calls.stats.edges)} calls, ` +
        `${Math.round(read.calls.stats.coverage * 100)}% of call sites resolved`,
      [...by].map(([k, v]) => `${k} ${v}`).join("  "),
      "",
      grid([
        ["MOST CALLED", "CALLERS", "CALLS", "LINES", "WHERE"],
        ...hot.map((one) => [
          cut(one.name, 30),
          one.callers.length,
          one.calls.length,
          one.lines,
          cut(one.file, 40),
        ]),
      ]),
    ].join("\n"),
    data: { stats: read.calls.stats, reach: Object.fromEntries(by), symbols: held },
  }
}

async function packages(repo: string) {
  const kit = await depsOf(repo)
  const named = kit.list.filter((one) => one.direct)
  return {
    text: [
      grid([
        ["PACKAGE", "VERSION", "LICENCE", "SIZE", "ADVISORIES"],
        ...named.map((one) => [
          cut(one.name, 34),
          one.version || one.range,
          one.license || "unknown",
          one.bytes ? `${Math.round(one.bytes / 1000)}k` : "-",
          one.advisories.length || "-",
        ]),
      ]),
      `\n${named.length} named, ${kit.list.length} on disk` +
        (kit.offline ? ", advisories unread: osv.dev did not answer" : "") +
        (kit.missed ? `, ${kit.missed} advisories named but not described` : ""),
    ].join("\n"),
    data: kit,
  }
}

function loose(read: Read, ask: Asked) {
  const paths = [...read.lines.keys()]
  const said = repeated(read.repo, paths)
  const same = copied(read.repo, paths)
  const chatty = talky(read.repo, paths)
  const take = ask.limit ?? 20
  const rest = (all: unknown[]) => (all.length > take ? `\n… and ${all.length - take} more` : "")
  return {
    text: [
      grid([
        ["REPEATED LITERAL", "FILES"],
        ...said.slice(0, take).map((one) => [cut(one.text, 56), one.times]),
      ]) + rest(said),
      grid([
        ["COPIED", "LINES", "AND"],
        ...same
          .slice(0, take)
          .map((one) => [cut(one.at[0], 44), one.lines.length, cut(one.at[1], 44)]),
      ]) + rest(same),
      ...(chatty.length
        ? [
            grid([
              ["MOSTLY COMMENT", "SHARE", "PROSE"],
              ...chatty
                .slice(0, take)
                .map((one) => [cut(one.path, 56), `${Math.round(one.share * 100)}%`, n(one.said)]),
            ]) + rest(chatty),
          ]
        : []),
    ].join("\n\n"),
    data: { repeated: said, copied: same, talky: chatty },
  }
}

/** the picture the overview draws, as the lines anybody would paste */
function shape(read: Read) {
  const { repo, stack } = analyze(read.repo)
  // "." is a path, not a name: the repo knows what it is called
  const name = repo.split("/").filter(Boolean).pop() ?? "repo"
  return {
    text: wall(name, read.layout.units, stack),
    data: { name, stack, units: read.layout.units },
  }
}

/** what it serves, what it calls, and which of those reach each other */
function wired(repo: string, ask: Asked) {
  // a folder of repos is one wire: a call in one of them lands on an endpoint in another
  const found = fleet(repo).length
    ? everyApi(repo)
    : (() => {
        const read = readIn(repo)
        return apiOf(repo, read.graph, read.calls)
      })()
  const by = new Map<string, number>()
  for (const one of found.links) by.set(one.endpoint, (by.get(one.endpoint) ?? 0) + 1)
  const take = ask.limit ?? 40
  const rest = (all: unknown[]) => (all.length > take ? `\n… and ${all.length - take} more` : "")
  const ends = [...found.endpoints].sort(
    (a, b) => (by.get(b.id) ?? 0) - (by.get(a.id) ?? 0) || a.path.localeCompare(b.path),
  )
  const to = new Map(found.links.map((one) => [one.call, one.to]))
  const sites = [...found.clients].sort(
    (a, b) => (to.has(b.id) ? 1 : 0) - (to.has(a.id) ? 1 : 0) || a.path.localeCompare(b.path),
  )
  const text =
    found.endpoints.length + found.clients.length
      ? [
          `${n(found.stats.endpoints)} endpoints, ${n(found.stats.clients)} call sites, ` +
            `${n(found.stats.linked)} of them land here and ${n(found.stats.outside)} go elsewhere` +
            (found.stats.frameworks.length ? `, off ${found.stats.frameworks.join(", ")}` : ""),
          "",
          grid([
            ["ENDPOINT", "VERB", "CALLED FROM", "BY", "WHERE"],
            ...ends
              .slice(0, take)
              .map((one) => [
                cut(one.path, 52),
                one.method,
                by.get(one.id) ?? 0,
                one.framework,
                cut(`${one.handler ?? one.file}:${one.line}`, 44),
              ]),
          ]) + rest(ends),
          "",
          grid([
            ["CALL SITE", "VERB", "HOST", "REACHES", "WHERE"],
            ...sites
              .slice(0, take)
              .map((one) => [
                cut(one.path, 44),
                one.method,
                cut(one.host || "-", 24),
                cut(to.get(one.id) ?? "outside", 36),
                cut(`${one.file}:${one.line}`, 40),
              ]),
          ]) + rest(sites),
        ].join("\n")
      : "nothing here serves or calls an http endpoint"
  return { text, data: found }
}

/** what kind of project this is, off the manifests and the marker files */
function kit(repo: string) {
  const { stack } = analyze(repo)
  // prettier-ignore
  const rows: [string, (string | number | undefined)[]][] = [
    ["language", [stack.kind, stack.primary, ...stack.typescript]],
    ["parts", stack.parts], ["frameworks", stack.frameworks], ["built into", stack.apps],
    ["runtime", [...stack.runtimes, ...stack.modules, ...stack.node]],
    ["state", stack.state], ["ui", stack.ui], ["styling", stack.styling],
    ["connects", stack.connects], ["testing", stack.testing], ["bundlers", stack.bundlers],
    ["linters", [...stack.linters, ...stack.formatters]], ["ci", stack.ci],
    ["hosting", stack.hosts], ["apis", stack.apis],
    ["packages", [`${stack.dependencies} deps`, ...new Set([...stack.managers, ...stack.lockfiles])]],
    ["licence", [stack.license, stack.private ? "private" : ""]],
  ]
  return {
    text: rows
      .map(([label, said]) => [label, said.filter(Boolean).join(", ")])
      .filter(([, said]) => said)
      .map(([label, said]) => `${label.padEnd(11)} ${said}`)
      .join("\n"),
    data: stack,
  }
}

/** how it grew, and who was there while it did */
function past(repo: string) {
  const line = timeline(repo)
  const stats = analyze(repo)
  return {
    text: [
      `${n(line.total)} commits, ${line.first.slice(0, 10)} to ${line.last.slice(0, 10)}`,
      "",
      grid([
        ["WHO", "COMMITS", "ADDED", "REMOVED", "FIRST", "LAST"],
        ...stats.contributors.map((one) => [
          cut(one.name, 30),
          n(one.commits),
          n(one.insertions),
          n(one.deletions),
          one.first.slice(0, 10),
          one.last.slice(0, 10),
        ]),
      ]),
    ].join("\n"),
    data: { ...line, contributors: stats.contributors },
  }
}

/** the whole repo as things and the relations between them, at the grain asked for */
function known(repo: string, read: Read, ask: Asked) {
  const found = knowledge(repo, {
    grain: (ask.grain ?? "module") as Grain,
    split: read.split,
    graph: read.graph,
    calls: read.calls,
    layout: read.layout,
  })
  return {
    text: asRows(found)
      .map((row) => row.join("\t"))
      .join("\n"),
    data: found,
  }
}

export async function views(
  view: View,
  repo: string,
  ask: Asked = {},
): Promise<{ text: string; data: unknown }> {
  if (view === "tasks") return work(repo, ask)
  if (view === "deps") return packages(repo)
  if (view === "stack") return kit(repo)
  if (view === "history") return past(repo)
  if (view === "api") return wired(repo, ask)
  const read = readIn(repo, ask.lang ?? "")
  if (view === "knowledge") return known(repo, read, ask)
  if (view === "architecture") return shape(read)
  return view === "modules" ? units(read) : view === "execution" ? runs(read) : loose(read, ask)
}

export { GRAINS, KINDS, IMPACTS, LANGUAGES, weigh }
export type { Grain, Hits, Sort, Task }
