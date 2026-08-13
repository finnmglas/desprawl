// owner: finn
// goal: every detection, read as work someone could pick up

import { reachOf, reached } from "./reach.ts"
import { familyOf, spreadOf } from "./verdict.ts"
import type { Calls } from "../../src/calls.ts"
import type { Deps } from "../../src/deps.ts"
import type { Graph } from "../../src/graph.ts"
import type { Cut, Layout, Unit } from "../../src/layers.ts"

export type Sort = "broken" | "licence" | "security" | "cycle" | "dead" | "shape" | "size"

/** who feels it if nobody does it. Not severity: a bloated folder costs only us */
export type Hits = "runtime" | "local dev" | "shipping" | "maintainability"

export const IMPACTS: Hits[] = ["runtime", "shipping", "local dev", "maintainability"]

export const FELT: Record<Hits, string> = {
  runtime: "it can reach whoever runs this, so it is not only a repo problem",
  shipping: "it decides what may be shipped or under what terms, rather than whether it works",
  "local dev": "it lands on whoever builds or tests here, and never on anybody running it",
  maintainability: "nothing breaks today: it is the cost of every change made after it",
}

export interface Task {
  id: string
  title: string
  kind: Sort
  /** where the work is */
  where: string
  /** in the words of whatever found it */
  why: string
  /** the closest thing to a size there is */
  lines: number
  /** how many things stop being wrong if it is done */
  reach: number
  /** minutes of an agent, guessed */
  minutes: number
  /** a known cure, which is what an agent is good for */
  mechanical: boolean
  /** who feels it if nobody does it */
  hits: Hits
}

const SEVERITY: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 }

// six screens of one function: a handful in a clean repo, none in a small one
const LONG = 300

/**
 * Minutes of an agent, off the only two runs timed here: 1.2 for the largest task, 1.9 for
 * an advisory. Files opened decides it, not lines. Past 45m a guess means nothing.
 */
const timed = (edits: number, lines = 0) =>
  Math.min(45, Math.max(2, Math.round(2 + edits * 1.5 + lines / 150)))

/** an order to read in, not a score: the two things anybody would sort by */
export const weigh = (task: Task) => task.reach / Math.max(1, task.minutes)

/** a licence not obviously safe to ship, or something filed against it */
function fromDeps(deps: Deps | null): Task[] {
  const found: Task[] = []
  for (const dep of deps?.list ?? []) {
    // one update clears every advisory against a package
    if (dep.advisories.length) {
      const worst = dep.advisories
        .map((one) => one.severity)
        .sort((a, b) => (SEVERITY[b.toLowerCase()] ?? 0) - (SEVERITY[a.toLowerCase()] ?? 0))[0]
      found.push({
        id: `advisory:${dep.name}`,
        title: `Update ${dep.name}, ${worst.toLowerCase()} ${dep.advisories.length > 1 ? `and ${dep.advisories.length - 1} more` : "advisory"}`,
        kind: "security",
        where: "package.json",
        // one line: axios alone files enough to bury the panel
        why:
          dep.advisories.length > 1
            ? `${dep.advisories.length} advisories against ${dep.version || dep.range}, worst ${worst.toLowerCase()}: ${dep.advisories[0].summary}`
            : `${worst}: ${dep.advisories[0].summary}`,
        lines: 1,
        reach: dep.advisories.reduce(
          (sum, one) => sum + (SEVERITY[one.severity.toLowerCase()] ?? 1),
          0,
        ),
        minutes: 4,
        mechanical: true,
        // a dev dependency is in nothing anybody runs
        hits: dep.dev ? "local dev" : "runtime",
      })
    }
    // nothing installed was nothing read, and that is not a licensing problem
    const family = familyOf(dep.license)
    if (
      dep.direct &&
      !dep.dev &&
      dep.version &&
      (family === "strong" || family === "closed" || family === "unknown")
    )
      found.push({
        id: `licence:${dep.name}`,
        title: `Check ${dep.name}, licensed ${dep.license || "unknown"}`,
        kind: "licence",
        where: "package.json",
        why:
          family === "strong"
            ? "a strong copyleft licence reaches whatever ships with it"
            : family === "closed"
              ? "it says nobody licensed it to you, which is a question for whoever added it"
              : "nothing here says what it is licensed as, which is not the same as permissive",
        lines: 1,
        reach: 1,
        minutes: 6,
        mechanical: false,
        hits: "shipping",
      })
  }
  return found
}

/** the deepest folder holding a whole ring */
export const shared = (paths: string[]): string => {
  const parts = paths[0].split("/").slice(0, -1)
  for (const path of paths) {
    const other = path.split("/").slice(0, -1)
    while (parts.length && parts.some((part, i) => other[i] !== part)) parts.pop()
  }
  return parts.join("/") || "."
}

/** a cure the cut list already knows: a type import moves, a barrel import is renamed */
const cheap = (cut: Cut) => cut.types === cut.imports || cut.types + cut.glue === cut.imports

/** an import naming what is not there */
function fromMissing(graph: Graph | null): Task[] {
  return (graph?.missing ?? []).map((one) => ({
    id: `missing:${one.from}:${one.specifier}`,
    title: `Fix the import of ${one.specifier} in ${one.from.split("/").pop()}`,
    kind: "broken" as const,
    where: one.from,
    why: `${one.from} imports ${one.specifier}, and that is ${one.reason}`,
    lines: 1,
    reach: 1,
    minutes: timed(1),
    mechanical: true,
    // not a style question
    hits: "runtime",
  }))
}

function fromLayout(layout: Layout | null, lines: Map<string, number>): Task[] {
  if (!layout) return []
  const found: Task[] = []
  for (const ring of layout.cycles) {
    const held = ring.reduce((sum, file) => sum + (lines.get(file) ?? 0), 0)
    found.push({
      id: `cycle:${ring[0]}`,
      title: `Break the import cycle in ${shared(ring)}`,
      kind: "cycle",
      where: shared(ring),
      why: `${ring.length} files import each other in a ring, which decides their load order`,
      lines: held,
      reach: ring.length,
      minutes: timed(ring.length),
      mechanical: false,
      // a ring loads in an order nobody chose
      hits: "runtime",
    })
  }
  for (const loop of layout.tangles)
    for (const cut of loop.cut.filter((one) => one.alone && cheap(one)))
      found.push({
        id: `cut:${cut.from}:${cut.to}`,
        title: `Drop the import of ${cut.to} from ${cut.from}`,
        kind: "cycle",
        where: cut.from,
        why:
          cut.types === cut.imports
            ? "every one of these is a type, which the build erases anyway"
            : "these go through a barrel, so naming the file that declares it is the whole change",
        lines: cut.imports,
        reach: loop.units.length,
        minutes: timed(1),
        mechanical: true,
        hits: "maintainability",
      })
  return found
}

/** oversize or bloated by the modules tab's threshold, not a second one invented here */
function fromUnits(units: Unit[]): Task[] {
  return units
    .filter((unit) => unit.role === "source")
    .map((unit) => ({ unit, band: spreadOf(unit.spread, unit.folders) }))
    .filter(({ band }) => band.label === "oversize" || band.label === "bloated")
    .map(({ unit, band }) => ({
      id: `spread:${unit.path}`,
      title: `Split ${unit.path}, ${unit.spread} things in one folder`,
      kind: "shape" as const,
      where: unit.path,
      why: band.why,
      lines: unit.lines,
      reach: unit.spread,
      minutes: timed(unit.spread * 0.5),
      mechanical: false,
      hits: "maintainability" as const,
    }))
}

function fromCalls(calls: Calls | null): Task[] {
  if (!calls) return []
  const found: Task[] = []
  const live = reached(calls, true)
  const dead = Object.values(calls.symbols).filter(
    (one) => one.kind !== "module" && reachOf(one, live) === "dead",
  )
  for (const one of dead)
    found.push({
      id: `dead:${one.id}`,
      title: `Delete ${one.name}, nothing reaches it`,
      kind: "dead",
      where: one.file,
      why: `${one.lines} lines that no file's top level and no export arrives at`,
      lines: one.lines,
      reach: 1,
      minutes: timed(1, one.lines),
      mechanical: true,
      // nothing stops, it only costs
      hits: "maintainability",
    })
  // one declaration nobody holds at once. A long file is not the same: the longest here
  // are word lists, and there is nothing to refactor in a list
  for (const one of Object.values(calls.symbols).filter(
    (row) => row.kind !== "module" && row.lines >= LONG,
  ))
    found.push({
      id: `long:${one.id}`,
      title: `Split ${one.name}, ${one.lines} lines in one declaration`,
      kind: "size",
      where: one.file,
      why: `one ${one.kind} of ${one.lines} lines, which is more than anybody reads in one go`,
      lines: one.lines,
      reach: 1,
      minutes: timed(4, one.lines),
      mechanical: false,
      hits: "maintainability",
    })

  // a repeated name is not work: handleSubmit is thirteen functions, Page is a framework
  // demand. Execution says it as a fact and leaves the reading to a person
  return found
}

/** every task this repo implies, most cleared per minute first */
export function tasks(
  layout: Layout | null,
  calls: Calls | null,
  deps: Deps | null,
  lines: Map<string, number>,
  graph: Graph | null = null,
): Task[] {
  const found = [
    ...fromMissing(graph),
    ...fromDeps(deps),
    ...fromLayout(layout, lines),
    ...fromUnits(layout?.units ?? []),
    ...fromCalls(calls),
  ]
  // one advisory arrives through several installs and is still one thing to do
  return [...new Map(found.map((one) => [one.id, one])).values()].sort(
    (a, b) => weigh(b) - weigh(a) || b.reach - a.reach,
  )
}

export const KINDS: Sort[] = ["broken", "security", "licence", "cycle", "dead", "shape", "size"]
