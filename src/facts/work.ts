// owner: finn
// goal: every detection, read as work someone could pick up

import type { Said, Talky, Twice } from "./sprawl.ts"
import { reachOf, reached } from "../read/reach.ts"
import { familyOf } from "./licence.ts"
import { spread } from "../read/shapes.ts"
import type { Calls } from "../read/calls.ts"
import type { Deps } from "./deps.ts"
import type { Graph } from "../read/graph.ts"
import type { Cut, Layout, Unit } from "../read/layers.ts"

// prettier-ignore
export type Sort =
  | "broken" | "licence" | "security" | "cycle" | "dead" | "copy" | "prose" | "shape" | "size"

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

/** off the only two runs timed here. Files opened decides it, not lines */
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
    .map((unit) => ({ unit, band: spread(unit.spread, unit.folders) }))
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
  // one declaration nobody holds at once. A long word list is not the same
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

  // a repeated name is not work, it is a fact for a person to read
  return found
}

// below this it is a handful somebody can just look at
const LOOSE = 3
// a run this long copied into another file is its own extraction
const SAME = 12
// below this many copies a shared name costs more than it saves
const NAMED = 3

/** a file that only exists to be run by the suite */
export const isTest = (path: string) =>
  /(^|\/)(test|tests|__tests__|spec|e2e)\//.test(path) || /\.(test|spec)\.[jt]sx?$/.test(path)

// a framework loads these by their name, so nothing here calling them proves nothing
const ROUTES =
  /(^|\/)(page|layout|route|middleware|error|loading|not-found|template|default|head|sitemap|robots|manifest|icon|apple-icon|opengraph-image|twitter-image|instrumentation|_app|_document|\+page|\+layout|\+server)\.[jt]sx?$/

const VENDORED =
  /(^|\/)(node_modules|bower_components|jspm_packages|web_modules|vendor|third_party|\.yarn|dist|build|out|coverage|\.next|\.nuxt|\.output)\//

export const isEntry = (path: string) =>
  ROUTES.test(path) ||
  /(^|\/)index\.[jt]sx?$/.test(path) ||
  /^(convex|functions|api|pages|app|src\/app|src\/pages|src\/routes|routes)\//.test(path)

/** read off disk by the cli, sent over the wire to a page that has none */
export interface Sprawl {
  repeated: Said[]
  copied: Twice[]
  talky: Talky[]
}

function fromText(text: Sprawl): Task[] {
  const found: Task[] = []
  const said = text.repeated.filter((one) => one.times >= NAMED && !one.styled)
  const looks = text.repeated.filter((one) => one.styled)
  if (looks.length) {
    const worst = looks.slice(0, 3).map((one) => `"${one.text.slice(0, 40)}" in ${one.times}`)
    found.push({
      id: "named:styles",
      title: `Make a component for ${looks.length} class lists repeated across files`,
      kind: "copy",
      where: looks[0].files[0],
      // the same copy as a literal, but naming this one hides what the element looks like
      why: `the same run of classes styles elements in several files, which is a component nobody made rather than a string to name: ${worst.join(", ")}`,
      lines: looks.reduce((sum, one) => sum + one.times, 0),
      reach: looks.length,
      minutes: timed(looks.length * 1.5),
      mechanical: false,
      hits: "maintainability",
    })
  }
  if (said.length) {
    const worst = said.slice(0, 3).map((one) => `"${one.text.slice(0, 40)}" in ${one.times}`)
    found.push({
      id: "named:literals",
      title: `Name ${said.length} literals written out across files`,
      kind: "copy",
      where: said[0].files[0],
      why: `the same text is typed in several files, so changing it means finding every copy: ${worst.join(", ")}`,
      lines: said.reduce((sum, one) => sum + one.times, 0),
      reach: said.length,
      minutes: timed(said.length * 0.4),
      mechanical: true,
      hits: "maintainability",
    })
  }
  for (const one of text.talky ?? []) {
    found.push({
      id: `prose:${one.path}`,
      title: `Read ${one.path.split("/").pop()}, ${Math.round(one.share * 100)}% of it is comment`,
      kind: "prose",
      where: one.path,
      why: `${Math.round(one.said / 1000)}k characters of prose against the code it explains, which is usually a design nobody could hold in their head`,
      lines: 0,
      reach: 1,
      minutes: timed(1, one.chars / 40),
      mechanical: false,
      hits: "maintainability",
    })
  }
  for (const one of text.copied.filter((c) => c.lines.length >= SAME)) {
    const [first, second] = one.at
    const both = one.at.map((at) => at.split(":")[0])
    found.push({
      id: `copy:${first}`,
      title: `${one.lines.length} lines are in both ${both[0].split("/").pop()} and ${both[1].split("/").pop()}`,
      kind: "copy",
      where: both[0],
      why: `${first} and ${second} hold the same ${one.lines.length} lines, so a fix has to land twice`,
      lines: one.lines.length * 2,
      reach: 2,
      minutes: timed(2, one.lines.length),
      mechanical: false,
      hits: "maintainability",
    })
  }
  return found
}

/** one decision to make, not one task per declaration */
function fromOpen(calls: Calls | null): Task[] {
  if (!calls) return []
  const live = reached(calls, true)
  const open = Object.values(calls.symbols)
    .filter((one) => one.kind !== "module" && reachOf(one, live) === "open")
    // a test, a vendored copy and a file a framework loads by name each prove nothing
    .filter((one) => !isTest(one.file) && !isEntry(one.file) && !VENDORED.test(one.file))
  if (open.length < LOOSE) return []
  const worst = [
    ...open.reduce(
      (by, one) => by.set(one.file, (by.get(one.file) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ].sort((a, b) => b[1] - a[1])[0]
  return [
    {
      id: "open:surface",
      title: `Decide on ${open.length} exported declarations nothing here calls`,
      kind: "dead",
      where: worst[0],
      why: `each is a public surface or a leftover, and only you know which. ${worst[0]} alone holds ${worst[1]}. The execution tab lists them all`,
      lines: open.reduce((sum, one) => sum + one.lines, 0),
      reach: open.length,
      minutes: timed(Math.min(open.length, 12)),
      mechanical: false,
      hits: "maintainability",
    },
  ]
}

/** every task this repo implies, most cleared per minute first */
export function tasks(
  layout: Layout | null,
  calls: Calls | null,
  deps: Deps | null,
  lines: Map<string, number>,
  graph: Graph | null = null,
  /** read off disk by whoever has one, since nothing here may open a file */
  text: Sprawl | null = null,
): Task[] {
  const found = [
    ...(text ? fromText(text) : []),
    ...fromOpen(calls),
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

export const KINDS: Sort[] = [
  "broken",
  "security",
  "licence",
  "cycle",
  "dead",
  "copy",
  "prose",
  "shape",
  "size",
]
