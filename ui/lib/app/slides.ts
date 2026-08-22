// owner: finn
// goal: what every panel says, as slides

import { balanced, fold } from "../../../src/read/layers.ts"
import { nameOf, namesOf } from "../../../src/read/naming.ts"
import { num, pct, plural, tokens } from "../text/format.ts"
import { shapeOf } from "../text/verdict.ts"
import type { Graph } from "../../../src/read/graph.ts"
import type { Stats } from "../../../src/read/model.ts"
import type { Slide } from "./paper.ts"

const sum = (edges: Record<string, number>) => Object.values(edges).reduce((s, n) => s + n, 0)
const top = <T>(list: T[], most = 14) => list.slice(0, most)
const rest = (list: unknown[], most = 14) =>
  list.length > most ? [`and ${num(list.length - most)} more`] : []

/** every panel, in tab order */
export function slides(stats: Stats, graph: Graph | null): Slide[] {
  const name = stats.repo.split("/").filter(Boolean).pop() ?? "repo"
  const source = stats.code + stats.comment
  const deck: Slide[] = [
    {
      title: name,
      hint: `${stats.repo} @${stats.head}`,
      lines: [
        `${num(stats.code)} lines of code across ${plural(stats.files, "file")}`,
        `${num(stats.comment)} comment lines, ${pct(stats.comment, source)} of source`,
        `~${num(tokens(stats.chars))} tokens, from ${num(stats.chars)} characters`,
        `${num(stats.commits)} commits by ${plural(stats.contributors.length, "dev")}`,
        `${stats.first.slice(0, 10)} to ${stats.last.slice(0, 10)}`,
        ...(stats.thin ? ["cloned without file contents, so line counts read 0"] : []),
      ],
    },
    {
      title: "What it is built from",
      hint: stats.stack.primary
        ? `mainly ${stats.stack.primary}`
        : "read off manifests and configs",
      lines: [
        ...(stats.stack.frameworks.length
          ? [`frameworks: ${stats.stack.frameworks.join(", ")}`]
          : []),
        ...(stats.stack.hosts.length ? [`hosts: ${stats.stack.hosts.join(", ")}`] : []),
        ...(stats.stack.apis.length ? [`services: ${stats.stack.apis.join(", ")}`] : []),
        ...(stats.stack.parts.length ? [`parts: ${stats.stack.parts.join(", ")}`] : []),
        ...(stats.stack.licenses.length ? [`licence: ${stats.stack.licenses.join(", ")}`] : []),
      ],
    },
    {
      title: "Languages",
      hint: `${plural(stats.languages.length, "language")} in the tree`,
      lines: [
        ...top(stats.languages).map(
          (l) => `${l.name}: ${num(l.code)} lines, ${pct(l.code, stats.code)} of the code`,
        ),
        ...rest(stats.languages),
      ],
    },
    {
      title: "Who wrote it",
      hint: `${plural(stats.contributors.length, "contributor")}`,
      lines: [
        ...top(stats.contributors).map(
          (c) =>
            `${c.name}: ${num(c.commits)} commits, ${pct(c.commits, stats.commits)}, +${num(c.insertions)} -${num(c.deletions)}`,
        ),
        ...rest(stats.contributors),
      ],
    },
  ]

  const tree = stats.tree.children ?? []
  deck.push(
    {
      title: "Files",
      hint: `${plural(stats.files, "file")}, the folders at the top of the tree`,
      lines: [
        ...top([...tree].sort((a, b) => b.code - a.code)).map(
          (n) =>
            `${n.name}${n.children ? "/" : ""}: ${num(n.code)} lines (${pct(n.code, stats.code)}), ${plural(n.files, "file")}, ${plural(n.comment, "comment")}, ${plural(n.commits, "commit")}`,
        ),
        ...rest(tree),
      ],
    },
    {
      title: "Over time",
      hint: `${stats.first.slice(0, 10)} to ${stats.last.slice(0, 10)}, ${plural(span(stats), "day")}`,
      lines: [
        `${num(stats.insertions)} lines added, ${num(stats.deletions)} removed`,
        `${num(stats.commits)} commits, ${(stats.commits / Math.max(1, span(stats))).toFixed(1)} a day on average`,
        ...top(busiest(stats), 8).map(([day, n]) => `${day}: ${plural(n, "commit")}`),
      ],
    },
    {
      title: "Recent work",
      hint: `the last ${Math.min(12, stats.log.length)} of ${num(stats.commits)} commits`,
      lines: top(stats.log, 12).map(
        (c) =>
          `${c.date.slice(0, 10)} ${c.hash} ${stats.contributors[c.who]?.name ?? "unknown"}: ${c.subject}`,
      ),
    },
  )

  if (!graph) return deck

  const layout = fold(graph, balanced(graph))
  const units = layout.units.filter((u) => u.role === "source")
  const called = namesOf(layout.units)
  const shape = (u: (typeof units)[number]) =>
    shapeOf(u.internal, sum(u.out), sum(u.in), Object.keys(u.out).length)

  const levels = Array.from({ length: layout.levels }, (_, i) => layout.levels - 1 - i)
    .map((level) => [level, units.filter((u) => u.level === level)] as const)
    .filter(([, here]) => here.length)

  deck.push(
    {
      title: "Modules",
      hint: `${plural(units.length, "group")} over ${plural(layout.levels, "level")}, grouped by weight`,
      lines: [
        ...top([...units].sort((a, b) => b.lines - a.lines)).map((u) => {
          const read = shape(u)
          return `${called.get(u.path)} (${u.path}): ${num(u.lines)} lines, ${plural(u.files, "file")}, L${u.level}, ${read.sure ? "" : "~"}${read.label}`
        }),
        ...rest(units),
      ],
    },
    {
      title: "Cycles",
      hint: layout.cycles.length
        ? "files that import each other in a ring, read off the files themselves"
        : "no file here imports one that imports it back",
      lines: [
        ...top(layout.cycles).map((ring) => {
          const where = ring[0].split("/").slice(0, -1).join("/")
          return `${plural(ring.length, "file")} inside ${where || "the repo root"}: ${ring
            .slice(0, 3)
            .map((p) => p.split("/").pop())
            .join(" <-> ")}${ring.length > 3 ? ", and more" : ""}`
        }),
        ...rest(layout.cycles),
      ],
    },
  )

  deck.push({
    title: "Dependency levels",
    hint: "L0 imports nothing here, each one above it leans on the ones below",
    lines: levels.map(
      ([level, here]) => `L${level}: ${here.map((u) => called.get(u.path)).join(", ")}`,
    ),
  })

  const links = units.flatMap((u) =>
    Object.entries(u.out)
      .filter(([to]) => units.some((other) => other.path === to))
      .map(([to, n]) => ({ from: u.path, to, n })),
  )
  deck.push({
    title: "Dependency grid",
    hint: `${plural(links.length, "dependency")} between ${plural(units.length, "group")}, heaviest first`,
    lines: [
      ...top([...links].sort((a, b) => b.n - a.n)).map(
        (e) => `${e.from} -> ${e.to}: ${plural(e.n, "file")}`,
      ),
      ...rest(links),
    ],
  })

  const doors = units.filter((u) => u.barrels)
  if (doors.length)
    deck.push({
      title: "Doors",
      hint: "files that declare nothing and hand on what they import, so imports pile through them",
      lines: [
        ...top(doors.sort((a, b) => b.barrels - a.barrels)).map(
          (u) =>
            `${called.get(u.path)}: ${plural(u.barrels, "door")} of ${plural(u.files, "file")}`,
        ),
        ...rest(doors),
      ],
    })

  if (layout.tangles.length)
    deck.push({
      title: "Folders that import each other",
      hint: "real coupling at this grain, and what it would take to open it",
      lines: layout.tangles.flatMap((tangle) => [
        `${plural(tangle.units.length, "group")}, ${plural(tangle.edges, "import")}, ${
          tangle.runtime
            ? tangle.deep
              ? "a file cycle spans it"
              : "only a loop at this grain"
            : "only types close it"
        }: ${tangle.units.map((u) => nameOf(u)).join(", ")}`,
        ...top(tangle.cut, 4).map(
          (cut) =>
            `   remove ${cut.from} -> ${cut.to}: ${plural(cut.imports, "import")}${cut.alone ? ", opens it alone" : ""}`,
        ),
      ]),
    })

  const cuts = layout.tangles.flatMap((t) => t.cut)
  if (cuts.length)
    deck.push({
      title: "Imports to remove",
      hint: "every import that has to go for nothing to loop, cheapest first",
      lines: [
        ...top(cuts).map(
          (cut) =>
            `${cut.from} -> ${cut.to}: ${plural(cut.imports, "import")}, ${cut.types === cut.imports ? "types only" : cut.types + cut.glue === cut.imports ? "name the file instead" : "a real change"}${cut.alone ? ", opens the loop alone" : ""}`,
        ),
        ...rest(cuts),
      ],
    })

  return deck
}

const span = (stats: Stats) =>
  Math.round((Date.parse(stats.last) - Date.parse(stats.first)) / 86_400_000) + 1

/** the days the most landed on */
function busiest(stats: Stats): [string, number][] {
  const byDay = new Map<string, number>()
  for (const commit of stats.log)
    byDay.set(commit.date.slice(0, 10), (byDay.get(commit.date.slice(0, 10)) ?? 0) + 1)
  return [...byDay].sort((a, b) => b[1] - a[1])
}
