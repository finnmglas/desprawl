// owner: finn
// goal: what imports what in a ring, and the cheapest way out of it

import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { CopyButton } from "../copy-button.tsx"
import { DataTable, type Column } from "../panels/data-table.tsx"
import { Section } from "../../atoms/section.tsx"
import { Tip } from "../../atoms/tip.tsx"
import { FEW, Some } from "./some.tsx"
import { group as asGroup, useGoing } from "../../../lib/app/going.tsx"
import { Refresh } from "../../atoms/icons.tsx"
import { plural, shortPath } from "../../../lib/say/format.ts"
import { shared } from "../../../lib/say/tasks.ts"
import { cn } from "../../../lib/app/ui.ts"
import type { Cut, Tangle, Unit } from "../../../../src/read/layers.ts"

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

const glued = (loop: Tangle) => {
  const glue = loop.cut.reduce((sum, edge) => sum + edge.glue, 0)
  const imports = loop.cut.reduce((sum, edge) => sum + edge.imports, 0)
  return glue > 0 && glue / Math.max(1, imports) >= 0.5
}

const rooted = (paths: string[]) => shared(paths).replace(/^\.$/, "the repo root")

/** every ring the repo holds, the folders they cross, and the imports that would end them */
export function Loops({
  at,
  cycles,
  loops,
  groupOf,
  units,
  label,
}: {
  /** the grain the groups were folded at, since a loop is only a loop at one */
  at: string
  cycles: string[][]
  loops: Tangle[]
  groupOf: (path: string) => string
  units: Unit[]
  label?: (path: string) => string
}) {
  const going = useGoing()
  const choose = (path: string) => going.open(asGroup(path, label?.(path)))
  if (!cycles.length && !loops.length) return null
  return (
    <>
      {cycles.length > 0 && (
        <Section id="table_cycles">
          <DataTable
            title="Cycles"
            hint="files that import each other in a ring, read off the files themselves"
            rows={cycles.map((ring) => ({
              ring,
              where: rooted(ring),
              spans: new Set(ring.map(groupOf)).size,
            }))}
            id={(row) => row.ring[0]}
            columns={RINGS}
            onRowClick={(row) =>
              going.open({
                kind: "folder",
                id: row.where === "the repo root" ? "" : row.where,
                name: row.where,
                note: `${plural(row.ring.length, "file")} importing each other in a ring`,
                related: row.ring,
                relation: "the ring, file by file",
              })
            }
          />
        </Section>
      )}

      {loops.length > 0 && (
        <Section id="card_loops">
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
                          onClick={() => choose(path)}
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
                      Removing {plural(loop.cut.length, "import")} of them fixes it, see below.
                    </p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </Section>
      )}

      {loops.length > 0 && (
        <Section id="table_loop_cuts">
          <DataTable
            title="Imports to remove"
            hint="every import to remove loops, cheapest first"
            rows={loops.flatMap((loop, id) => loop.cut.map((edge) => ({ ...edge, loop: id + 1 })))}
            id={(edge) => `${edge.from} ${edge.to}`}
            columns={CUTS}
            onRowClick={(edge) => going.open(asGroup(edge.from, label?.(edge.from)))}
          />
        </Section>
      )}
    </>
  )
}
