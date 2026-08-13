// owner: finn
// goal: every detection, read as work someone could pick up

import { reachOf, reached } from "./reach.ts"
import { familyOf, spreadOf } from "./verdict.ts"
import type { Calls } from "../../src/calls.ts"
import type { Deps } from "../../src/deps.ts"
import type { Graph } from "../../src/graph.ts"
import type { Cut, Layout, Unit } from "../../src/layers.ts"

export type Sort = "broken" | "licence" | "security" | "cycle" | "dead" | "shape" | "size"

/**
 * Who feels it if this is never done. It is not severity: a bloated folder and a dead export
 * are both work nobody outside the repo would notice, and that is worth saying next to a
 * broken import that stops the thing running.
 */
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
  /** the file or folder to open, which is where the work is */
  where: string
  /** what it is, in the words of whatever detected it */
  why: string
  /** lines it would touch, which is the closest thing to a size there is */
  lines: number
  /** how many things stop being wrong if it is done */
  reach: number
  /** guessed off the lines and the kind, in minutes of an agent's time */
  minutes: number
  /** a cure known to be mechanical, which is what an agent is good for */
  mechanical: boolean
  /** who feels it if nobody does it */
  hits: Hits
}

const SEVERITY: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 }

// six screens of one function: picked off the spread across the repos this is measured on,
// where it names a handful in a clean repo and none at all in a small one
const LONG = 300

/**
 * Minutes of an agent's time, anchored on the only runs anybody has actually timed here: a
 * plan for the largest task in this repo took 1.2 minutes and one for a dependency advisory
 * took 1.9. Writing costs more than reading, so a fix is taken as a few times a plan, and it
 * is the number of files it opens that decides that rather than how many lines they hold.
 * Past three quarters of an hour the guess means nothing, so it stops there and says so.
 */
const timed = (edits: number, lines = 0) =>
  Math.min(45, Math.max(2, Math.round(2 + edits * 1.5 + lines / 150)))

/**
 * What the priority is, and why it is a sort and not a score: it is the order this list is
 * read in, made of the two things a reader would sort by anyway. Nothing here rates the repo.
 */
export const weigh = (task: Task) => task.reach / Math.max(1, task.minutes)

/** an install whose licence is not obviously safe to ship, or that has something filed against it */
function fromDeps(deps: Deps | null): Task[] {
  const found: Task[] = []
  for (const dep of deps?.list ?? []) {
    // every advisory against one package is one update, so it is one task carrying all of them
    if (dep.advisories.length) {
      const worst = dep.advisories
        .map((one) => one.severity)
        .sort((a, b) => (SEVERITY[b.toLowerCase()] ?? 0) - (SEVERITY[a.toLowerCase()] ?? 0))[0]
      found.push({
        id: `advisory:${dep.name}`,
        title: `Update ${dep.name}, ${worst.toLowerCase()} ${dep.advisories.length > 1 ? `and ${dep.advisories.length - 1} more` : "advisory"}`,
        kind: "security",
        where: "package.json",
        // one line, not twenty nine: axios alone files enough of these to bury the panel
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
        // a dev dependency is not in anything anybody runs, whatever is filed against it
        hits: dep.dev ? "local dev" : "runtime",
      })
    }
    // nothing installed means nothing was read: an uninstalled package has no licence here to
    // doubt, and a repo without node_modules is not a repo with a licensing problem
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

/** the deepest folder holding every file of a ring, which is where the fix lives */
const shared = (paths: string[]): string => {
  const parts = paths[0].split("/").slice(0, -1)
  for (const path of paths) {
    const other = path.split("/").slice(0, -1)
    while (parts.length && parts.some((part, i) => other[i] !== part)) parts.pop()
  }
  return parts.join("/") || "."
}

/** a cure the cut list already knows: a type import moves, a barrel import is renamed */
const cheap = (cut: Cut) => cut.types === cut.imports || cut.types + cut.glue === cut.imports

/** an import naming something that is not there: the one finding with nothing to weigh up */
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
    // an import of something that is not there is not a style question
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
      // a ring loads in an order nobody chose, which is a runtime fact and not a tidiness one
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

/**
 * A folder the modules tab already calls oversize or bloated. The threshold is that verdict's
 * and not one invented here: two places calling the same folder crowded at different sizes
 * would be two answers to one question.
 */
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
      // it ships, it builds, and it is read: none of that stops, it only costs
      hits: "maintainability",
    })
  // one declaration long enough that nobody holds it at once. A file being long is not the
  // same thing: the longest files in these repos are word lists and fixtures, and there is
  // nothing to refactor in a list. A single body this long is always worth splitting
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

  // a name in many files is not work: handleSubmit is thirteen different functions of four to
  // sixty six lines, and Page is what the framework demands each route export. Execution says
  // so as a fact and leaves the reading to a person, which is where that belongs
  return found
}

/** every task this repo implies, heaviest first by what it clears per minute spent */
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
  // one advisory reaches a repo through several installs of the same package, and it is
  // still one thing to do: the id is what says so
  return [...new Map(found.map((one) => [one.id, one])).values()].sort(
    (a, b) => weigh(b) - weigh(a) || b.reach - a.reach,
  )
}

export const KINDS: Sort[] = ["broken", "security", "licence", "cycle", "dead", "shape", "size"]
