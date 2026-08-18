// owner: finn
// goal: import modules analyzed

import { useEffect, useMemo, useState } from "react"
import { Badge } from "../components/atoms/badge.tsx"
import { Button } from "../components/atoms/button.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { Face, Hands } from "../components/molecules/panels/hands.tsx"
import { Section } from "../components/atoms/section.tsx"
import { Grid } from "../components/molecules/graph/grid.tsx"
import { ImportKpis } from "../components/molecules/graph/import-kpis.tsx"
import { Levels } from "../components/molecules/graph/levels.tsx"
import { Loops } from "../components/molecules/graph/loops.tsx"
import { DataTable, type Column } from "../components/molecules/panels/data-table.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Kpi, Kpis } from "../components/molecules/panels/kpi.tsx"
import { Loading } from "../components/molecules/onward.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Path, Tip } from "../components/atoms/tip.tsx"
import { num, plural, shortPath } from "../lib/say/format.ts"
import { importGraph } from "../lib/app/live.ts"
import { group as asGroup, holds, useGoing } from "../lib/app/going.tsx"
import { useKept } from "../lib/app/kept.ts"
import { hands, worked } from "../lib/app/people.ts"
import { namesUnder } from "../../src/read/naming.ts"
import { layeringOf, shapeOf, spreadOf, tanglesOf, type Shape } from "../lib/say/verdict.ts"
import { balanced, fold, unitOf, type Layout, type Unit } from "../../src/read/layers.ts"
import type { Sort } from "../lib/say/format.ts"
import type { Graph } from "../../src/read/graph.ts"
import type { Stats } from "../../src/read/model.ts"

const AUTO = "auto"
const GROUPS = [AUTO, "top folder", "folder", "subfolder", "file"]
const DEPTH: Record<string, number> = { "top folder": 1, folder: 2, subfolder: 3, file: 99 }
const JOINS: Record<string, string> = {
  "top folder": "src",
  folder: "src/ui",
  subfolder: "src/ui/lib",
  file: "file itself",
}
const KEEP = ["source only", "all folders"]

const real = (unit: Unit) => unit.role === "source"

const count = (edges: Record<string, number>) => Object.values(edges).reduce((sum, n) => sum + n, 0)

/** how many groups it leans on, which one dependency imported by every file is not */
const reach = (unit: Unit) => Object.keys(unit.out).length

/** a tilde says the label sits one import away from another one */
const shaped = (shape: Shape) => (shape.sure ? shape.label : `~${shape.label}`)

/** the label the group would get without its busiest file */
const carried = (unit: Unit, shape: Shape) => {
  if (!unit.loudest || !shape.sure) return null
  const { internal, out, into, reach } = unit.without
  const less = shapeOf(internal, out, into, reach)
  return less.label === shape.label ? null : less
}

const sureness = (shape: Shape) =>
  shape.sure
    ? `Decided on ${plural(shape.edges, "import")}, and no single one of them would move it elsewhere`
    : `Decided on only ${plural(shape.edges, "import")}, and moving one of them would land it on another label`

/** most of what ties it together goes through a file that only forwards */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    // contents, so every panel here is an item of the tab that holds it
    <div className="contents">
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">{children}</CardContent>
      </Card>
    </div>
  )
}

export function Modules({
  stats,
  faces,
  repos = [],
}: {
  stats: Stats
  faces: Record<string, string>
  /** the repos in a fleet, so a group is named for its place inside its own */
  repos?: string[]
}) {
  const going = useGoing()
  const [graph, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  // set up here, so coming back finds them still set
  const [group, setGroup] = useKept("modules.group", "")
  const [keep, setKeep] = useKept("modules.keep", KEEP[0])

  const [sort, setSort] = useKept<Sort | null>("modules.sort", null)

  const where = useMemo(() => worked(stats.tree), [stats.tree])
  const [find, setFind] = useKept("modules.find", "")

  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
  }, [])

  const at = group || AUTO
  // kept: the only way back from a file to its group
  const split = useMemo(
    () => (graph ? (at === AUTO ? balanced(graph) : DEPTH[at]) : null),
    [graph, at],
  )
  const layout: Layout | null = useMemo(
    () => (graph && split !== null ? fold(graph, split) : null),
    [graph, split],
  )
  const units = useMemo(
    () => (layout ? layout.units.filter((u) => keep === KEEP[1] || real(u)) : []),
    [layout, keep],
  )

  if (!graph)
    return <Loading stats={stats} current="Graph" what="Reading all imports," onward={false} />

  if (!layout || !units.length) return <Empty>No imports, possibly no TS/JS here.</Empty>

  const kept = new Set(units.map((u) => u.path))
  const links = units.reduce(
    (sum, u) => sum + Object.keys(u.out).filter((to) => kept.has(to)).length,
    0,
  )
  const loops = layout.tangles.filter((t) => t.units.some((path) => kept.has(path)))
  // the file rings, which no grouping can invent or hide, unlike the tangles above them
  const cycles = layout.cycles
  const groupOf = (path: string) =>
    typeof split === "number" ? unitOf(path, split) : (split?.[path] ?? "")
  // the group pairs a real ring runs through: those edges are not a matter of tidiness
  const rings = new Set<string>()
  for (const ring of cycles) {
    const held = new Set(ring)
    for (const file of ring)
      for (const edge of graph.modules[file].out) {
        if (edge.type || !held.has(edge.to)) continue
        // same group both ends lands on the diagonal
        rings.add(`${groupOf(file)} ${groupOf(edge.to)}`)
      }
  }
  const levels = Math.max(...units.map((u) => u.level)) + 1
  const files = units.reduce((sum, u) => sum + u.files, 0)
  const dropped = layout.units.length - units.length
  // grid size still understandable, nothing hidden
  const hunted = find.trim().toLowerCase()
  const shown = hunted ? units.filter((u) => u.path.toLowerCase().includes(hunted)) : units
  // auto names a group for what it is
  const called = namesUnder(units, repos)
  const columns: Column<Unit>[] =
    at === AUTO
      ? [
          {
            ...COLUMNS[0],
            get: (u) => called.get(u.path) ?? u.path,
            cell: (u) => (
              <Tip className="max-w-56 min-w-0" text={u.path}>
                <span className="block truncate">{called.get(u.path) ?? u.path}</span>
              </Tip>
            ),
          },
          {
            key: "where",
            label: "Path",
            get: (u) => u.path,
            cell: (u) => <Path of={u.path} as={shortPath(u.path, 40)} />,
            hint: "the folder the group was cut from, which its name no longer has to carry",
          },
          ...COLUMNS.slice(1),
        ]
      : COLUMNS
  // auto derives a name, so every panel that names a group uses that one
  const label = at === AUTO ? (path: string) => called.get(path) ?? path : undefined
  const picked = sort && columns.find((column) => column.key === sort.key)
  const order = picked
    ? (a: Unit, b: Unit) => {
        const [x, y] = [picked.get(a), picked.get(b)]
        const cmp =
          typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y))
        return sort.asc ? cmp : -cmp
      }
    : undefined
  const cuts = new Set(loops.flatMap((l) => l.cut.map((c) => `${c.from} ${c.to}`)))
  // deepest first, and only the levels that hold something
  // the click asks which rather than deciding
  const choose = (path: string) => going.open(asGroup(path, label?.(path)))
  // the group answering for whatever the reader arrived holding, picked on another tab
  const focus = holds(
    going.at.pick,
    units.map((u) => u.path),
  )

  return (
    // contents, so every panel here is an item of the tab that holds it
    <div className="contents">
      <ImportKpis graph={graph} />

      <Section id="kpis_modules_groups" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1">
          <Tabs tabs={KEEP} value={keep} onChange={setKeep} />
          <Tabs className="ml-auto" tabs={GROUPS} value={at} onChange={setGroup} />
        </div>

        <Kpis>
          <Kpi
            label="Module groups"
            value={num(units.length)}
            sub={`${plural(files, "file")}, grouped ${at === AUTO ? "by weight" : `by ${at}`}`}
            verdict={{
              label: at,
              tone: "plain",
              why:
                at === AUTO
                  ? "folders picked by code size, trying to evenly cluster them"
                  : `every file counts as its ${at}, so src/ui/lib/thing.ts is bucketed ${JOINS[at]}`,
            }}
          />
          <Kpi
            label="Depth"
            value={num(levels)}
            sub={levels > 1 ? "steps from top to bottom" : "everything side by side"}
            verdict={layeringOf(levels, units.length)}
          />
          <Kpi
            label="Cycles"
            value={num(cycles.length)}
            sub={
              cycles.length
                ? `${plural(
                    cycles.reduce((sum, ring) => sum + ring.length, 0),
                    "file",
                  )} caught in them`
                : "no file imports one that imports it back"
            }
            verdict={tanglesOf(cycles.length, graph.stats.files)}
          />
          <Kpi
            label="Module links"
            value={num(links)}
            sub={`from ${num(graph.stats.edges)} imports between files`}
            verdict={{
              label: `${(links / units.length).toFixed(1)} each`,
              tone: "plain",
              why: "Link = 1+ files in a group importing another",
            }}
          />
        </Kpis>
      </Section>

      <Section id="table_modules">
        <DataTable
          title="Module groups"
          hint={at === AUTO ? "auto-detected structure" : `groups by ${at}`}
          rows={[...shown].sort((a, b) => b.files - a.files)}
          id={(u) => u.path}
          saves={[
            {
              name: "imports",
              label: "Every import",
              note: `${num(graph.stats.edges)} imports between ${num(graph.stats.files)} files, as`,
              rows: () => [
                ["from", "to", "type only", "lazy"],
                ...Object.values(graph.modules).flatMap((m) =>
                  m.out.map((e) => [m.path, e.to, String(e.type), String(e.lazy)]),
                ),
              ],
            },
          ]}
          columns={[
            ...columns,
            {
              key: "owner",
              label: "Dev",
              get: (u) => hands(u.path, where, stats.contributors)[0]?.who.name ?? "",
              cell: (u) => {
                const crew = hands(u.path, where, stats.contributors)
                if (!crew.length) return null
                return (
                  <Tip
                    className="flex justify-center"
                    side="bottom"
                    text={<Hands of={crew} faces={faces} />}
                  >
                    <Face of={crew} faces={faces} />
                  </Tip>
                )
              },
              hint: "who committed most to contained files",
            },
          ]}
          onRowClick={(u) => choose(u.path)}
          onSort={setSort}
          mark={(u) => !!focus && u.path === focus}
        >
          {focus && (
            <Button variant="outline" size="sm" onClick={() => going.go({ pick: "" })}>
              {label?.(focus) ?? shortPath(focus, 24)} ✕
            </Button>
          )}
          <Input
            value={find}
            onChange={(event) => setFind(event.target.value)}
            placeholder={`Search ${plural(units.length, "group")}`}
            className="ml-auto w-44"
          />
        </DataTable>
      </Section>

      <Grid
        shown={shown}
        units={units}
        kept={kept}
        links={links}
        rings={rings}
        cuts={cuts}
        focus={focus}
        label={label}
        order={order}
        onPick={choose}
      />

      <Levels units={units} focus={focus} label={label} dropped={dropped} onPick={choose} />

      <Loops at={at} cycles={cycles} loops={loops} groupOf={groupOf} units={units} label={label} />
    </div>
  )
}

/** what it keeps in against what it reaches out for */
const Balance = ({ unit }: { unit: Unit }) => {
  const out = count(unit.out)
  const whole = Math.max(1, unit.internal + out)
  const share = (unit.internal / whole) * 100
  // never round a leak away: 99.6% inside is not all inside
  const label = out ? Math.min(99, Math.round(share)) : 100
  return (
    <Tip
      text={`${plural(unit.internal, "import")} never leave ${unit.path}, ${plural(out, "import")} reach another group`}
    >
      <div className="bg-muted flex h-5 w-40 overflow-hidden rounded-sm text-[10px] leading-5 font-medium">
        {unit.internal > 0 && (
          <div
            // full saturation glares on a dark page, the same way a brand chip does
            className="h-full overflow-hidden bg-sky-500 px-1.5 text-left whitespace-nowrap text-white dark:bg-[color-mix(in_oklab,var(--color-sky-500),black_28%)] dark:text-sky-50"
            style={{ width: `${share}%` }}
          >
            {share > 22 ? `${label}% in` : share > 9 ? `${label}%` : ""}
          </div>
        )}
        {out > 0 && (
          <div
            className="h-full overflow-hidden bg-amber-500 px-1.5 text-right whitespace-nowrap text-amber-950 dark:bg-[color-mix(in_oklab,var(--color-amber-500),black_28%)] dark:text-amber-50"
            style={{ width: `${100 - share}%` }}
          >
            {100 - share > 22 ? `${num(out)} out` : 100 - share > 9 ? num(out) : ""}
          </div>
        )}
      </div>
    </Tip>
  )
}

const COLUMNS: Column<Unit>[] = [
  {
    key: "path",
    label: "Group",
    get: (u) => u.path,
    cell: (u) => (
      <Tip className="max-w-64 min-w-0" text={u.path}>
        <span className="block truncate">{shortPath(u.path, 40)}</span>
      </Tip>
    ),
  },
  {
    key: "lines",
    label: "Lines",
    num: true,
    get: (u) => u.lines,
    hint: "every line its files hold, blank and comment included, which is what there is to read",
  },
  { key: "files", label: "Files", num: true, get: (u) => u.files },
  {
    key: "balance",
    label: "Inside and outside",
    num: true,
    flat: true,
    left: true,
    get: (u) => Math.round((u.internal / Math.max(1, u.internal + count(u.out))) * 100),
    cell: (u) => <Balance unit={u} />,
    hint: "imports that stay against those reaching out. One that mostly imports itself can move on its own",
  },
  {
    key: "spread",
    label: "Spread",
    num: true,
    flat: true,
    left: true,
    get: (u) => u.spread,
    cell: (u) => {
      const band = spreadOf(u.spread, u.folders)
      return (
        <Tip
          text={
            <>
              {band.why}
              <br />
              {num(Math.round(u.lines / Math.max(1, u.files)))} lines per file on average
            </>
          }
        >
          <Badge variant="outline" className={band.tone}>
            {band.label}
          </Badge>
        </Tip>
      )
    },
    hint: "what opening the folder would show: the files and subfolders directly inside it, counted as one list",
  },
  {
    key: "shape",
    label: "Classification",
    get: (u) => shaped(shapeOf(u.internal, count(u.out), count(u.in), reach(u))),
    cell: (u) => {
      const shape = shapeOf(u.internal, count(u.out), count(u.in), reach(u))
      const rests = carried(u, shape)
      return (
        <Tip
          text={
            <>
              {shape.why}
              <br />
              {sureness(shape)}
              {rests && (
                <>
                  <br />
                  Almost all of that lands on <span className="font-mono">{u.loudest}</span>.
                  Without it the other {plural(u.files - 1, "file")} here read as {rests.label}, so
                  the label describes that one file more than the group
                </>
              )}
            </>
          }
        >
          <Badge variant="outline" className={shape.tone}>
            {shaped(shape)}
            {rests && <span className="ml-1 opacity-60">·1 file</span>}
          </Badge>
        </Tip>
      )
    },
    hint: "Inside, Leaves and Arrives together: what it keeps, needs and is needed for. A star is the near miss, a tilde means one import would move it",
  },
  {
    key: "exports",
    label: "Exports",
    num: true,
    get: (u) => u.exports,
    hint: "names it hands out, so its surface rather than its size",
  },
  {
    key: "level",
    label: "Level",
    num: true,
    flat: true,
    get: (u) => u.level,
    hint: "how far its own dependencies reach, 0 for a group that imports nothing else here",
  },
  {
    key: "inside",
    label: "Inside",
    num: true,
    get: (u) => u.internal,
    hint: "imports that never leave the group, the cohesion it earns",
  },
  {
    key: "out",
    label: "Leaves",
    num: true,
    get: (u) => count(u.out),
    hint: "imports reaching other groups, so what it needs to exist",
  },
  {
    key: "in",
    label: "Arrives",
    num: true,
    get: (u) => count(u.in),
    hint: "imports coming from other groups, so the cost of changing it",
  },
  {
    key: "barrels",
    label: "Doors",
    num: true,
    good: true,
    get: (u) => u.barrels,
    cell: (u) =>
      u.barrels ? (
        <Tip text="a file that declares nothing and only hands on what it imports. Everything reaching this group through one goes in as a single import, which flatters its cohesion and hides who depends on it">
          <span className="underline decoration-dotted">{num(u.barrels)}</span>
        </Tip>
      ) : (
        <span className="text-muted-foreground">0</span>
      ),
    hint: "barrel files: they forward other files rather than declare anything, so imports pile through them",
  },
  {
    key: "packages",
    label: "Packages",
    num: true,
    get: (u) => u.packages,
    hint: "installed packages it reaches for, counted once each",
  },
]
