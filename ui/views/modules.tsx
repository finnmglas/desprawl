// owner: finn
// goal: the shape the imports actually make, said in plain words

import { useEffect, useMemo, useState } from "react"
import { Back } from "../components/back.tsx"
import { Badge } from "../components/badge.tsx"
import { Button } from "../components/button.tsx"
import { Card, CardContent } from "../components/card.tsx"
import { CopyButton } from "../components/copy-button.tsx"
import { CardHead } from "../components/card-head.tsx"
import { DataTable, type Column } from "../components/data-table.tsx"
import { Refresh } from "../components/icons.tsx"
import { Input } from "../components/input.tsx"
import { Kpi } from "../components/kpi.tsx"
import { Matrix } from "../components/matrix.tsx"
import { Onward } from "../components/onward.tsx"
import { Tabs } from "../components/tabs.tsx"
import { Tip } from "../components/tip.tsx"
import { num, plural, shortPath } from "../lib/format.ts"
import { importGraph } from "../lib/live.ts"
import { layeringOf, tanglesOf } from "../lib/verdict.ts"
import { cn } from "../lib/ui.ts"
import { balanced, fold, type Cut, type Layout, type Unit } from "../../src/layers.ts"
import type { Sort } from "../lib/format.ts"
import type { Graph } from "../../src/graph.ts"
import type { Stats } from "../../src/model.ts"

// auto picks its own folders, the rest cut every path at the same depth:
// src/ui/lib/thing.ts as src, src/ui, src/ui/lib, or the file itself
const AUTO = "auto"
const GROUPS = [AUTO, "top folder", "folder", "subfolder", "file"]
const DEPTH: Record<string, number> = { "top folder": 1, folder: 2, subfolder: 3, file: 99 }
const JOINS: Record<string, string> = {
  "top folder": "src",
  folder: "src/ui",
  subfolder: "src/ui/lib",
  file: "the file itself",
}
const KEEP = ["source only", "all folders"]

// a wall of anything says less than a count does
const FEW = 6

const real = (unit: Unit) => unit.role === "source"

const count = (edges: Record<string, number>) => Object.values(edges).reduce((sum, n) => sum + n, 0)

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

/** a row that stays short until asked, like the metadata card */
function Some({ children, few = 3 }: { children: React.ReactNode[]; few?: number }) {
  const [open, setOpen] = useState(false)
  const hidden = children.length - few
  return (
    <div className="flex flex-wrap items-center gap-1">
      {open ? children : children.slice(0, few)}
      {hidden > 0 && (
        <button
          onClick={() => setOpen(!open)}
          className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-xs"
        >
          {open ? "show less" : `+${num(hidden)} more`}
        </button>
      )}
    </div>
  )
}

export function Modules({
  stats,
  onTab,
  onPath,
}: {
  stats: Stats
  onTab: (tab: string) => void
  onPath: (path: string[]) => void
}) {
  const [graph, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  const [group, setGroup] = useState("")
  const [keep, setKeep] = useState(KEEP[0])
  const [wide, setWide] = useState(false)
  // the grid draws the same groups, so it follows whatever order the table was put in
  const [sort, setSort] = useState<Sort | null>(null)
  // one search over the groups, since the table and the grid draw the same ones
  const [find, setFind] = useState("")

  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
  }, [])

  const at = group || AUTO
  const layout: Layout | null = useMemo(
    () => (graph ? fold(graph, at === AUTO ? balanced(graph) : DEPTH[at]) : null),
    [graph, at],
  )
  const units = useMemo(
    () => (layout ? layout.units.filter((u) => keep === KEEP[1] || real(u)) : []),
    [layout, keep],
  )

  if (!graph)
    return (
      <Empty stats={stats} onTab={onTab}>
        Reading every import in the repo. A large one takes a few seconds, and the answer is held
        after that.
      </Empty>
    )

  if (!layout || !units.length)
    return (
      <Empty stats={stats} onTab={onTab}>
        Nothing here imports anything. There is no typescript or javascript source tracked in this
        repo, so it has no import structure to read.
      </Empty>
    )

  const kept = new Set(units.map((u) => u.path))
  const links = units.reduce(
    (sum, u) => sum + Object.keys(u.out).filter((to) => kept.has(to)).length,
    0,
  )
  const loops = layout.tangles.filter((t) => t.units.some((path) => kept.has(path)))
  const levels = Math.max(...units.map((u) => u.level)) + 1
  const files = units.reduce((sum, u) => sum + u.files, 0)
  const dropped = layout.units.length - units.length
  // a grid this size still reads at a glance, so nothing is worth hiding behind a button
  const hunted = find.trim().toLowerCase()
  const shown = hunted ? units.filter((u) => u.path.toLowerCase().includes(hunted)) : units
  const crowded = shown.length > 50
  const picked = sort && COLUMNS.find((column) => column.key === sort.key)
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
  const folder = (path: string) => !/\.[a-z]+$/.test(path)
  const open = (path: string) => folder(path) && onPath(path.split("/"))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Back onTab={onTab} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Tabs tabs={KEEP} value={keep} onChange={setKeep} />
          <Tabs tabs={GROUPS} value={at} onChange={setGroup} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Groups"
          value={num(units.length)}
          sub={`${plural(files, "file")}, grouped ${at === AUTO ? "by weight" : `by ${at}`}`}
          verdict={{
            label: at,
            tone: "plain",
            why:
              at === AUTO
                ? "folders picked by weight, opening the heaviest until no group holds a tenth of the repo. Never a single file, and every file lands in exactly one group"
                : `every file counts as its ${at}, so src/ui/lib/thing.ts joins ${JOINS[at]}`,
          }}
        />
        <Kpi
          label="Depth"
          value={num(levels)}
          sub={
            levels > 1 ? "steps from the top down to the leaves" : "everything sits side by side"
          }
          verdict={layeringOf(levels, units.length)}
        />
        <Kpi
          label="Loops"
          value={num(loops.length)}
          sub={
            loops.length
              ? `${plural(
                  loops.reduce((sum, loop) => sum + loop.edges, 0),
                  "import",
                )} caught in them`
              : "nothing imports its own importer"
          }
          verdict={tanglesOf(loops.length, units.length)}
        />
        <Kpi
          label="Links"
          value={num(links)}
          sub={`from ${num(graph.stats.edges)} imports between files`}
          verdict={{
            label: `${(links / units.length).toFixed(1)} each`,
            tone: "plain",
            why: "one link is one group importing another, however many files did it",
          }}
        />
      </div>

      <DataTable
        title="Module groups"
        hint={
          at === AUTO ? "the folders auto picked, and how each sits" : `every group at ${at} level`
        }
        rows={[...shown].sort((a, b) => b.files - a.files)}
        id={(u) => u.path}
        columns={COLUMNS}
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
        <CardHead
          title="Dependency Grid (auto-adjusts to module sorts)"
          hint="Row imports column, sorted by depending count"
          wrap
        >
          {crowded && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setWide(!wide)}>
              {wide ? "hide more" : "show all"}
            </Button>
          )}
        </CardHead>
        <CardContent>
          <Matrix
            units={shown}
            across={units}
            most={crowded && !wide ? 12 : shown.length}
            order={order}
            cuts={new Set(loops.flatMap((l) => l.cut.map((c) => `${c.from} ${c.to}`)))}
            onPick={open}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHead
          title="Dependency levels"
          hint="a group's level is how far its own dependencies reach: level 0 imports nothing else here, and everything above it only leans downward"
        />
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
                            {plural(unit.files, "file")}, {num(unit.exports)} exported names
                            <br />
                            leans on {plural(Object.keys(unit.out).length, "group")}, carried by{" "}
                            {plural(Object.keys(unit.in).length, "group")}
                            {unit.tangle >= 0 && <> · caught in a loop</>}
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
                          <span className="max-w-56 truncate">{unit.path}</span>
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
              {plural(dropped, "group")} left out, because tests, config and scripts are not the
              architecture. Switch to everything to see them.
            </p>
          )}
        </CardContent>
      </Card>

      {loops.length > 0 && (
        <Card>
          <CardHead
            title="Internal dependency loops"
            hint="groups that import each other (bad, as it doesnt allow abstractions and isolation)"
          >
            <CopyButton
              className="ml-auto"
              label="Copy every loop, as text"
              text={() =>
                loops
                  .map((loop) =>
                    [
                      loop.units.join(" + "),
                      `${loop.units.length} groups, ${loop.edges} imports, ${loop.runtime ? "loops at runtime" : "only types close it"}`,
                      ...loop.cut.map(
                        (edge) =>
                          `  remove ${edge.from} -> ${edge.to} (${edge.imports} imports${edge.types === edge.imports ? ", type only" : ""}${edge.alone ? ", opens the loop alone" : ""})`,
                      ),
                    ].join("\n"),
                  )
                  .join("\n\n")
              }
              message={`Copied ${loops.length === 1 ? "1 loop" : `${loops.length} loops`}`}
              note="Members, size, and every import to remove"
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
                        {path}
                      </button>
                    ))}
                  </Some>
                  <p className="text-muted-foreground text-xs">
                    {plural(loop.units.length, "group")} holding {plural(held, "file")}, tied
                    together by {plural(loop.edges, "import")}.{" "}
                    {loop.runtime ? (
                      "It is there when the code runs, so it decides load order too."
                    ) : (
                      <Tip text="every import that closes it carries only types, and typescript erases those. The loop is real in the source and gone in the build">
                        <span className="underline decoration-dotted">
                          Only types close it, so nothing loops at runtime.
                        </span>
                      </Tip>
                    )}{" "}
                    Removing {plural(loop.cut.length, "import")} of them leaves nothing looping,
                    listed below, and it is one set that works rather than the only one.
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
          hint="every import that has to go for the loops above to open, cheapest first"
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

type Removal = Cut & { loop: number }

const CUTS: Column<Removal>[] = [
  { key: "from", label: "Remove from", get: (edge) => edge.from },
  { key: "to", label: "Its import of", get: (edge) => edge.to },
  {
    key: "imports",
    label: "Files doing it",
    num: true,
    get: (edge) => edge.imports,
    hint: "how many files in the group make that import, so how much there is to move",
  },
  {
    key: "kind",
    label: "Costs",
    get: (edge) => (edge.types === edge.imports ? "a type move" : "real work"),
    cell: (edge) =>
      edge.types === edge.imports ? (
        <Tip text="typescript erases these, so moving the type is usually the whole fix">
          <span className="text-muted-foreground">a type move</span>
        </Tip>
      ) : (
        <Tip text="this one is there when the code runs, so removing it is a real change">
          <span className="flex items-center gap-1">
            <Refresh className="size-3" />
            real work
          </span>
        </Tip>
      ),
    hint: "an import carrying only types is erased by the build, so it is the cheap kind to move",
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

/**
 * What the balance says a group is. A folder that only imports itself is a module
 * whatever it is called, and one that only imports others is composition. The stars
 * are the near misses, which is where the work usually is.
 */
const SHAPES: { label: string; from: number; tone: string; why: string }[] = [
  {
    label: "Module",
    from: 100,
    tone: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
    why: "every import stays inside it. This can be lifted out of the repo as it stands",
  },
  {
    label: "Module*",
    from: 80,
    tone: "border-sky-500/50 text-sky-700 dark:text-sky-300",
    why: "four imports in five stay inside. A module once the last few are dealt with",
  },
  {
    label: "Sprawl",
    from: 30,
    tone: "border-amber-500/60 text-amber-700 dark:text-amber-300",
    why: "half in, half out. It is neither a module nor a composition layer, which is what makes it hard to move or to name",
  },
  {
    label: "Entrypoint*",
    from: 1,
    tone: "border-violet-500/50 text-violet-700 dark:text-violet-300",
    why: "almost everything it imports comes from elsewhere, so it mostly composes other groups",
  },
  {
    label: "Entrypoint",
    from: 0,
    tone: "border-violet-500/50 text-violet-700 dark:text-violet-300",
    why: "it imports only other groups and nothing of its own. A composition layer, which is what a top of the stack looks like",
  },
]

const shapeOf = (unit: Unit) => {
  const out = count(unit.out)
  // nothing imported at all is self contained by definition, not a composition layer
  if (!unit.internal && !out) return SHAPES[0]
  const inside = (unit.internal / (unit.internal + out)) * 100
  return SHAPES.find((shape) => inside >= shape.from) ?? SHAPES[SHAPES.length - 1]
}

/** the split every group is really judged on: what it keeps in against what it reaches out for */
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
        {/* a zero wide segment still has its padding, so it draws a sliver of a lie */}
        {unit.internal > 0 && (
          <div
            className="h-full overflow-hidden bg-sky-500 px-1.5 whitespace-nowrap text-white"
            style={{ width: `${share}%` }}
          >
            {share > 22 ? `${label}% in` : share > 9 ? `${label}%` : ""}
          </div>
        )}
        {out > 0 && (
          <div
            className="h-full overflow-hidden bg-amber-500 px-1.5 text-right whitespace-nowrap text-amber-950"
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
    cell: (u) => <Tip text={u.path}>{shortPath(u.path)}</Tip>,
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
    get: (u) => Math.round((u.internal / Math.max(1, u.internal + count(u.out))) * 100),
    cell: (u) => <Balance unit={u} />,
    hint: "imports that never leave the group against those reaching another. A group that mostly imports itself can be moved on its own",
  },
  {
    key: "shape",
    label: "Reads as",
    get: (u) => shapeOf(u).label,
    cell: (u) => {
      const shape = shapeOf(u)
      return (
        <Tip text={shape.why}>
          <Badge variant="outline" className={shape.tone}>
            {shape.label}
          </Badge>
        </Tip>
      )
    },
    hint: "what the balance makes it, read off the share of imports that stay inside. A star is the near miss",
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
    key: "packages",
    label: "Packages",
    num: true,
    get: (u) => u.packages,
    hint: "installed packages it reaches for, counted once each",
  },
]
