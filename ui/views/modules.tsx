// owner: finn
// goal: import modules analyzed

import { useEffect, useMemo, useRef, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Button } from "../components/atoms/button.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { Face, Hands } from "../components/molecules/hands.tsx"
import { Circle } from "../components/molecules/circle.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { Refresh } from "../components/atoms/icons.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Kpi, Kpis } from "../components/molecules/kpi.tsx"
import { Matrix } from "../components/molecules/matrix.tsx"
import { Save } from "../components/molecules/save.tsx"
import { Onward } from "../components/molecules/onward.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Path, Tip } from "../components/atoms/tip.tsx"
import { Waiting } from "../components/atoms/waiting.tsx"
import { num, plural, shortPath } from "../lib/format.ts"
import { importGraph } from "../lib/live.ts"
import { hands, worked } from "../lib/people.ts"
import { namesOf } from "../lib/naming.ts"
import { layeringOf, shapeOf, spreadOf, tanglesOf, type Shape } from "../lib/verdict.ts"
import { cn } from "../lib/ui.ts"
import {
  balanced,
  fold,
  unitOf,
  type Cut,
  type Layout,
  type Tangle,
  type Unit,
} from "../../src/layers.ts"
import type { Sort } from "../lib/format.ts"
import type { Graph } from "../../src/graph.ts"
import type { Stats } from "../../src/model.ts"

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
const VIEWS = ["grid", "circle"]
const FEW = 6

const real = (unit: Unit) => unit.role === "source"

const count = (edges: Record<string, number>) => Object.values(edges).reduce((sum, n) => sum + n, 0)

/** how many groups it leans on, which one dependency imported by every file is not */
const reach = (unit: Unit) => Object.keys(unit.out).length

/** a tilde says the label sits one import away from another one */
const shaped = (shape: Shape) => (shape.sure ? shape.label : `~${shape.label}`)

/** the label the rest of the group would get without the file the most imports arrive at */
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

/** the deepest folder holding every file of a ring, which is where the fix lives */
const shared = (paths: string[]): string => {
  const parts = paths[0].split("/").slice(0, -1)
  for (const path of paths) {
    const other = path.split("/").slice(0, -1)
    while (parts.length && parts.some((part, i) => other[i] !== part)) parts.pop()
  }
  return parts.join("/") || "the repo root"
}

/** most of what ties it together goes through a file that only forwards */
const glued = (loop: Tangle) => {
  const glue = loop.cut.reduce((sum, edge) => sum + edge.glue, 0)
  const imports = loop.cut.reduce((sum, edge) => sum + edge.imports, 0)
  return glue > 0 && glue / Math.max(1, imports) >= 0.5
}

function Empty({
  stats,
  onTab,
  children,
}: {
  stats: Stats
  onTab: (tab: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <Back onTab={onTab} />
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">{children}</CardContent>
      </Card>
      <Onward stats={stats} current="Modules" onTab={onTab} />
    </div>
  )
}

// expandable
function Some({ children, few = 3 }: { children: React.ReactNode[]; few?: number }) {
  const [open, setOpen] = useState(false)
  const most = open ? Math.min(children.length, 120) : few
  const hidden = children.length - most
  const over = children.length > few
  return (
    <div className="flex flex-wrap items-center gap-1">
      {children.slice(0, most)}
      {over && (
        <button
          onClick={() => setOpen(!open)}
          className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-xs"
        >
          {open ? "show less" : `+${num(hidden)} more`}
        </button>
      )}
      {open && hidden > 0 && (
        <span className="text-muted-foreground px-1 text-xs">
          {num(hidden)} more in table below
        </span>
      )}
    </div>
  )
}

export function Modules({
  stats,
  faces,
  onTab,
  onPath,
}: {
  stats: Stats
  faces: Record<string, string>
  onTab: (tab: string) => void
  onPath: (path: string[]) => void
}) {
  const [graph, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  const [group, setGroup] = useState("")
  const [keep, setKeep] = useState(KEEP[0])
  const [wide, setWide] = useState(false)

  const grid = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<Sort | null>(null)
  const [view, setView] = useState(VIEWS[0])

  const where = useMemo(() => worked(stats.tree), [stats.tree])
  const [find, setFind] = useState("")

  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
  }, [])

  const at = group || AUTO
  // kept, not just passed on: it is the only way back from a file to the group holding it
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
    return (
      <div className="flex flex-col gap-4">
        <Back onTab={onTab} />
        <Card>
          <CardContent className="p-4">
            <Waiting what="Reading all imports," slow="Large repo takes a few seconds." rows={4} />
          </CardContent>
        </Card>
        <Onward stats={stats} current="Modules" onTab={onTab} />
      </div>
    )

  if (!layout || !units.length)
    return (
      <Empty stats={stats} onTab={onTab}>
        No imports, possibly no TS/JS here.
      </Empty>
    )

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
        // same group on both ends lands on the diagonal, where it is the only way to see it
        rings.add(`${groupOf(file)} ${groupOf(edge.to)}`)
      }
  }
  const levels = Math.max(...units.map((u) => u.level)) + 1
  const files = units.reduce((sum, u) => sum + u.files, 0)
  const dropped = layout.units.length - units.length
  // grid size still understandable, nothing hidden
  const hunted = find.trim().toLowerCase()
  const shown = hunted ? units.filter((u) => u.path.toLowerCase().includes(hunted)) : units
  const crowded = shown.length > 50
  // auto names a group for what it is, so the folder it came from moves to its own column
  const called = namesOf(units)
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
  const stacked = (): [number, Unit[]][] =>
    Array.from({ length: levels }, (_, i) => levels - 1 - i)
      .map((level): [number, Unit[]] => [level, units.filter((u) => u.level === level)])
      .filter(([, here]) => here.length)
  const folder = (path: string) => !/\.[a-z]+$/.test(path)
  // remainder group = "/*"
  const open = (path: string) => {
    const at = path.replace(/\/?\*$/, "")
    if (folder(at)) onPath(at ? at.split("/") : [])
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Back onTab={onTab} />
        <Save
          className="ml-auto"
          name="imports"
          rows={() => [
            ["from", "to", "type only", "lazy"],
            ...Object.values(graph.modules).flatMap((m) =>
              m.out.map((e) => [m.path, e.to, String(e.type), String(e.lazy)]),
            ),
          ]}
          note={`${num(graph.stats.edges)} imports between ${num(graph.stats.files)} files, as`}
        />
      </div>

      <Kpis>
        <Kpi
          label="Importing files"
          value={num(graph.stats.files)}
          sub={`reaching ${plural(Object.keys(graph.packages).length, "installed package")}`}
          verdict={{
            label: "in graph",
            tone: "plain",
            why: "every ts, js file git tracks",
          }}
        />
        <Kpi
          label="Imports"
          value={num(graph.stats.edges)}
          sub={`${num(graph.stats.external)} more into packages`}
          verdict={{
            label: "file to file",
            tone: "plain",
            why: "imports resolve to other files in repo.",
          }}
        />
        <Kpi
          label="Imports/file"
          value={(graph.stats.edges / Math.max(1, graph.stats.files)).toFixed(1)}
          sub="imports per average file"
          verdict={{
            label: "average",
            tone: "plain",
            why: "High means little standalone, low that repo is loosely tied",
          }}
        />
        <Kpi
          label="Resolution"
          value={`${(graph.stats.coverage * 100).toFixed(graph.stats.coverage === 1 ? 0 : 2)}%`}
          sub={
            graph.missing.length
              ? `${plural(graph.missing.length, "import")} are unresolved`
              : "every imported file found"
          }
          verdict={
            graph.missing.length
              ? {
                  label: "partial",
                  tone: "watch",
                  why: "some faulty or non-resolvable imports",
                }
              : {
                  label: "complete",
                  tone: "fine",
                  why: "every file + package found",
                }
          }
        />
      </Kpis>

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

      <DataTable
        title="Module groups"
        hint={at === AUTO ? "auto-detected structure" : `groups by ${at}`}
        rows={[...shown].sort((a, b) => b.files - a.files)}
        id={(u) => u.path}
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
        onRowClick={(u) => open(u.path)}
        onSort={setSort}
        fold={12}
      >
        <Input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder={`Search ${plural(units.length, "group")}`}
          className="ml-auto w-44"
        />
      </DataTable>

      <Card>
        <CardHead title="Dependency Grid" hint="Row imports column, module sort applies" wrap>
          <div className="ml-auto flex items-center gap-1">
            <Tabs tabs={VIEWS} value={view} onChange={setView} />
            {crowded && view === VIEWS[0] && (
              <Button variant="outline" size="sm" onClick={() => setWide(!wide)}>
                {wide ? "hide some" : "show all"}
              </Button>
            )}
            <CopyButton
              label="Copy every dependency, as text"
              text={() =>
                shown
                  .flatMap((u) =>
                    Object.entries(u.out)
                      .filter(([to]) => kept.has(to))
                      .map(
                        ([to, n]) =>
                          `${u.path}\t${to}\t${n}\t${rings.has(`${u.path} ${to}`) ? "cycle" : cuts.has(`${u.path} ${to}`) ? "break" : ""}`,
                      ),
                  )
                  .join("\n")
              }
              message={`Copied ${plural(links, "dependency")}`}
              note="From, to, how many files, and whether it is a cycle"
            />
            <Save
              name="dependency-grid"
              picture={() => grid.current}
              rows={() => [
                ["from", "to", "imports", "kind"],
                ...shown.flatMap((u) =>
                  Object.entries(u.out)
                    .filter(([to]) => kept.has(to))
                    .map(([to, n]) => [
                      u.path,
                      to,
                      n,
                      rings.has(`${u.path} ${to}`)
                        ? "cycle"
                        : cuts.has(`${u.path} ${to}`)
                          ? "break"
                          : "import",
                    ]),
                ),
              ]}
              note={`${plural(links, "dependency")}, as`}
            />
          </div>
        </CardHead>
        <CardContent>
          <div ref={grid}>
            {view === VIEWS[0] ? (
              <Matrix
                rings={rings}
                label={label}
                units={shown}
                across={units}
                most={crowded && !wide ? 12 : shown.length}
                order={order}
                cuts={cuts}
                onPick={open}
              />
            ) : (
              <Circle units={shown} cuts={cuts} rings={rings} label={label} onPick={open} />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHead title="Dependency levels" hint="L0 imports nothing, L1 at least L0 etc">
          <div className="ml-auto flex items-center gap-1">
            <CopyButton
              label="Copy the levels, as text"
              text={() =>
                stacked()
                  .map(([level, here]) => `L${level}\t${here.map((u) => u.path).join(", ")}`)
                  .join("\n")
              }
              message={`Copied ${plural(levels, "level")}`}
              note="Each level and the groups sitting on it"
            />
            <Save
              name="levels"
              rows={() => [
                ["level", "group", "path", "files", "lines", "classification"],
                ...stacked().flatMap(([level, here]) =>
                  here.map((u) => [
                    level,
                    label?.(u.path) ?? u.path,
                    u.path,
                    u.files,
                    u.lines,
                    shaped(shapeOf(u.internal, count(u.out), count(u.in), reach(u))),
                  ]),
                ),
              ]}
              note={`${plural(units.length, "group")} over ${plural(levels, "level")}, as`}
            />
          </div>
        </CardHead>
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: levels }, (_, i) => levels - 1 - i).map((level) => {
            const here = units.filter((u) => u.level === level)
            if (!here.length) return null
            return (
              <div key={level} className="flex items-start gap-3 border-t pt-2 first:border-0">
                <div className="w-28 shrink-0">
                  <div className="text-xs font-medium">level {level}</div>
                  <div className="text-muted-foreground text-xs">
                    {plural(here.length, "group")}, {num(here.reduce((s, u) => s + u.files, 0))}{" "}
                    files
                  </div>
                </div>
                <Some>
                  {[...here]
                    .sort((a, b) => b.files - a.files)
                    .map((unit) => (
                      <Tip
                        key={unit.path}
                        text={
                          <>
                            <span className="font-mono">{unit.path}</span>
                            <br />
                            {plural(unit.files, "file")}, {num(unit.exports)} exported names
                            <br />
                            leans on {plural(Object.keys(unit.out).length, "group")}, carried by{" "}
                            {plural(Object.keys(unit.in).length, "group")}
                            {unit.tangle >= 0 && <> · in loop</>}
                          </>
                        }
                      >
                        <button
                          onClick={() => open(unit.path)}
                          className={cn(
                            "hover:border-ring flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                            unit.tangle >= 0 && "border-amber-500/60",
                          )}
                        >
                          <span className="max-w-56 truncate">
                            {label?.(unit.path) ?? unit.path}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {num(unit.files)}
                          </span>
                        </button>
                      </Tip>
                    ))}
                </Some>
              </div>
            )
          })}
          {dropped > 0 && (
            <p className="text-muted-foreground border-t pt-2 text-xs">
              {plural(dropped, "group")} left out tests, config, scripts for the source-only
              setting.
            </p>
          )}
        </CardContent>
      </Card>

      {cycles.length > 0 && (
        <DataTable
          title="Cycles"
          hint="files that import each other in a ring, read off the files themselves"
          rows={cycles.map((ring) => ({
            ring,
            where: shared(ring),
            spans: new Set(ring.map(groupOf)).size,
          }))}
          id={(row) => row.ring[0]}
          columns={RINGS}
          fold={8}
        />
      )}

      {loops.length > 0 && (
        <Card>
          <CardHead
            title="Folders that import each other"
            hint={`at the ${at} grain: real coupling, but only the ones marked below are cycles in the code`}
          >
            <CopyButton
              className="ml-auto"
              label="Copy every loop, as text"
              text={() =>
                loops
                  .map((loop) =>
                    [
                      loop.units.join(" + "),
                      `${loop.units.length} groups, ${loop.edges} imports, ${loop.runtime ? (loop.deep ? "loops at runtime, a file cycle spans it" : "loops at this grain only, no file cycle spans it") : "only types close it"}${glued(loop) ? ", held together by barrels" : ""}`,
                      ...loop.cut.map(
                        (edge) =>
                          `  remove ${edge.from} -> ${edge.to} (${edge.imports} imports, ${costOf(edge).label}${edge.alone ? ", opens the loop alone" : ""})`,
                      ),
                    ].join("\n"),
                  )
                  .join("\n\n")
              }
              message={`Copied ${loops.length === 1 ? "1 loop" : `${loops.length} loops`}`}
              note="Members, size, every import to remove"
            />
          </CardHead>
          <CardContent className="flex flex-col gap-5">
            {loops.map((loop) => {
              const held = loop.units.reduce(
                (sum, path) => sum + (units.find((u) => u.path === path)?.files ?? 0),
                0,
              )
              return (
                <div key={loop.units.join()} className="flex flex-col gap-2">
                  <Some few={FEW}>
                    {loop.units.map((path) => (
                      <button
                        key={path}
                        onClick={() => open(path)}
                        className="cursor-pointer rounded-md border border-amber-500/60 px-2 py-0.5 text-xs"
                      >
                        {label?.(path) ?? path}
                      </button>
                    ))}
                  </Some>
                  <p className="text-muted-foreground text-xs">
                    {plural(loop.units.length, "group")} holding {plural(held, "file")}, tied
                    together by {plural(loop.edges, "import")}.{" "}
                    {!loop.runtime ? (
                      <Tip text="real in source, gone in builds">
                        <span className="underline decoration-dotted">
                          Type import loop, nothing loops at runtime.
                        </span>
                      </Tip>
                    ) : loop.deep ? (
                      <Tip text="checked at file grain: a single file cycle already spans these folders, so no amount of regrouping removes it">
                        <span className="underline decoration-dotted">
                          There in runtime, decides load order.
                        </span>
                      </Tip>
                    ) : (
                      <Tip text="checked at file grain: no file cycle spans these folders, so the loop is where the files sit, not how they run">
                        <span className="underline decoration-dotted">
                          Only a loop at this grain, no file cycle spans it.
                        </span>
                      </Tip>
                    )}{" "}
                    {glued(loop) ? (
                      <Tip text="these imports go through a file that only forwards, so naming the file that declares it is the whole fix">
                        <span className="underline decoration-dotted">
                          Held together by barrels.
                        </span>
                      </Tip>
                    ) : null}{" "}
                    Removing {plural(loop.cut.length, "import")} of them fixes it, see below..
                  </p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {loops.length > 0 && (
        <DataTable
          title="Imports to remove"
          hint="every import to remove loops, cheapest first"
          rows={loops.flatMap((loop, id) => loop.cut.map((edge) => ({ ...edge, loop: id + 1 })))}
          id={(edge) => `${edge.from} ${edge.to}`}
          columns={CUTS}
          fold={12}
        />
      )}

      <Onward stats={stats} current="Modules" onTab={onTab} />
    </div>
  )
}

interface Ring {
  ring: string[]
  where: string
  /** groups it crosses at this grain: one means the grouping hides it entirely */
  spans: number
}

const RINGS: Column<Ring>[] = [
  {
    key: "where",
    label: "Inside",
    get: (row) => row.where,
    cell: (row) => <Tip text={row.where}>{shortPath(row.where)}</Tip>,
    hint: "the deepest folder holding every file of the ring, so the whole fix is in there",
  },
  { key: "files", label: "Files", num: true, get: (row) => row.ring.length },
  {
    key: "spans",
    label: "Groups",
    num: true,
    flat: true,
    get: (row) => row.spans,
    cell: (row) =>
      row.spans > 1 ? (
        <Tip text="the grouping above splits this ring, so it shows there as a loop between folders too">
          <span className="underline decoration-dotted">{row.spans}</span>
        </Tip>
      ) : (
        <Tip text="every file of it sits in one group, so the grouping above cannot show it at all">
          <span className="text-muted-foreground underline decoration-dotted">1</span>
        </Tip>
      ),
    hint: "how many groups at this grain it crosses. One means only this table can see it",
  },
  {
    key: "members",
    label: "Ring",
    get: (row) => row.ring.join(" -> "),
    cell: (row) => (
      <span className="text-muted-foreground font-mono text-xs">
        {row.ring
          .slice(0, 3)
          .map((path) => path.split("/").pop())
          .join(" \u2194 ")}
        {row.ring.length > 3 && ` and ${row.ring.length - 3} more`}
      </span>
    ),
    hint: "the files caught in it, by name",
  },
]

type Removal = Cut & { loop: number }

/** what removing it would actually take */
const costOf = (edge: Cut): { label: string; why: string; work: boolean } =>
  edge.types === edge.imports
    ? {
        label: "type move",
        why: "typescript erases these, so moving the type is usually the whole fix",
        work: false,
      }
    : edge.types + edge.glue === edge.imports
      ? {
          label: "name the file",
          why: "each goes through a file that only forwards, so importing the declaring file removes the edge without moving code",
          work: false,
        }
      : {
          label: "manual",
          why: "this one is there when the code runs, so removing it is a real change",
          work: true,
        }

const CUTS: Column<Removal>[] = [
  { key: "from", label: "Remove in", get: (edge) => edge.from },
  { key: "to", label: "import of", get: (edge) => edge.to },
  {
    key: "imports",
    label: "Files doing it",
    num: true,
    get: (edge) => edge.imports,
    hint: "how many files = ca. how much work",
  },
  {
    key: "kind",
    label: "Costs",
    get: (edge) => costOf(edge).label,
    cell: (edge) => {
      const cost = costOf(edge)
      return (
        <Tip text={cost.why}>
          <span className={cn("flex items-center gap-1", !cost.work && "text-muted-foreground")}>
            {cost.work && <Refresh className="size-3" />}
            {cost.label}
          </span>
        </Tip>
      )
    },
    hint: "a type import is erased by the build, a barrel import needs a different path: both cheaper than a refactor",
  },
  {
    key: "alone",
    label: "On its own",
    get: (edge) => (edge.alone ? "opens the loop" : "only with the rest"),
    cell: (edge) =>
      edge.alone ? (
        <Tip text="checked against the graph: with this one import gone the group stops being a loop at all">
          <span className="underline decoration-dotted">opens the loop</span>
        </Tip>
      ) : (
        <span className="text-muted-foreground">only with the rest</span>
      ),
    hint: "whether removing this one import is enough by itself, or only counts as part of the set",
  },
  { key: "loop", label: "Loop", num: true, flat: true, get: (edge) => edge.loop },
]

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
