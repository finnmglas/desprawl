// owner: finn
// goal: call graph analyzed

import { useEffect, useMemo, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Kpi } from "../components/molecules/kpi.tsx"
import { Onward } from "../components/molecules/onward.tsx"
import { Save } from "../components/molecules/save.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Tip } from "../components/atoms/tip.tsx"
import { Waiting } from "../components/atoms/waiting.tsx"
import { callGraph } from "../lib/live.ts"
import { num, plural, shortPath } from "../lib/format.ts"
import { REACHES, reachOf, reached, rings, twins } from "../lib/reach.ts"
import { deadOf } from "../lib/verdict.ts"
import type { Calls, Symbol } from "../../src/calls.ts"
import type { Stats } from "../../src/model.ts"

const ROOTS = ["exports count", "entry points only"]
const KINDS = ["all", "function", "component", "class"]

const named = (id: string) => id.split("#").pop() ?? id
const fileOf = (id: string) => id.split("#")[0]

export function Execution({
  stats,
  onTab,
  onPath,
}: {
  stats: Stats
  onTab: (tab: string) => void
  onPath: (path: string[]) => void
}) {
  const [calls, setCalls] = useState<Calls | null>(window.__DESPRAWL_CALLS__ ?? null)
  const [roots, setRoots] = useState(ROOTS[0])
  const [kind, setKind] = useState(KINDS[0])
  const [find, setFind] = useState("")

  useEffect(() => {
    if (!calls) void callGraph().then(setCalls)
  }, [])

  const live = useMemo(
    () => (calls ? reached(calls, roots === ROOTS[0]) : new Set<string>()),
    [calls, roots],
  )
  const repeated = useMemo(() => (calls ? twins(calls) : []), [calls])
  const loops = useMemo(() => (calls ? rings(calls) : []), [calls])

  if (!calls)
    return (
      <div className="flex flex-col gap-4">
        <Back onTab={onTab} />
        <Card>
          <CardContent className="p-4">
            <Waiting what="Reading every call," slow="Large repo takes a few seconds." rows={4} />
          </CardContent>
        </Card>
        <Onward stats={stats} current="Execution" onTab={onTab} />
      </div>
    )

  const all = Object.values(calls.symbols)
  const declared = all.filter((s) => s.kind !== "module")
  if (!declared.length)
    return (
      <div className="flex flex-col gap-4">
        <Back onTab={onTab} />
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nothing declares a function or a class here, so there is no call graph to read.
          </CardContent>
        </Card>
        <Onward stats={stats} current="Execution" onTab={onTab} />
      </div>
    )

  const state = (symbol: Symbol) => reachOf(symbol, live)
  const dead = declared.filter((s) => state(s) === "dead")
  const only = declared.filter((s) => state(s) === "open")
  const deadLines = dead.reduce((sum, s) => sum + s.lines, 0)
  const declaredLines = declared.reduce((sum, s) => sum + s.lines, 0)
  const busiest = [...declared].sort((a, b) => b.callers.length - a.callers.length)[0]

  const lost = [
    ...calls.unresolved
      .reduce((held, one) => {
        const found = held.get(one.name) ?? { name: one.name, sites: 0, from: [] as string[] }
        found.sites++
        if (found.from.length < 4) found.from.push(one.from)
        return held.set(one.name, found)
      }, new Map<string, { name: string; sites: number; from: string[] }>())
      .values(),
  ].sort((a, b) => b.sites - a.sites)

  const hunted = find.trim().toLowerCase()
  const shown = declared.filter(
    (s) =>
      (kind === KINDS[0] || s.kind === kind) &&
      (!hunted || s.name.toLowerCase().includes(hunted) || s.file.toLowerCase().includes(hunted)),
  )
  const walk = (file: string) => onPath(file.split("/").slice(0, -1))

  const columns: Column<Symbol>[] = [
    ...WHAT,
    {
      key: "reach",
      label: "Reach",
      get: (s) => REACHES[state(s)].label,
      cell: (s) => {
        const at = state(s)
        return (
          <Tip text={REACHES[at].why}>
            <Badge variant="outline" className={REACHES[at].tone}>
              {REACHES[at].label}
            </Badge>
          </Tip>
        )
      },
      hint: "whether anything that runs arrives at it, following calls from every file's top level",
    },
    ...COUNTS,
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Back onTab={onTab} />
        <Save
          className="ml-auto"
          name="calls"
          rows={() => [
            ["from", "from file", "to", "to file"],
            ...all.flatMap((s) => s.calls.map((to) => [s.name, s.file, named(to), fileOf(to)])),
          ]}
          note={`${num(calls.stats.edges)} calls between ${num(calls.stats.symbols)} declarations, as`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Declarations"
          value={num(declared.length)}
          sub={`${num(calls.stats.functions)} functions, ${num(calls.stats.components)} components, ${num(calls.stats.classes)} classes`}
          verdict={{
            label: `${plural(calls.stats.files, "file")}`,
            tone: "plain",
            why: "every function, class and component declared at the top level of a file. A closure inside one is part of it, not its own",
          }}
        />
        <Kpi
          label="Calls"
          value={num(calls.stats.edges)}
          sub={`${num(calls.stats.external)} into packages, ${num(calls.stats.builtin)} into the runtime`}
          verdict={{
            label: `${(calls.stats.edges / Math.max(1, declared.length)).toFixed(1)} each`,
            tone: "plain",
            why: "a call from one declaration to another in this repo, counted once per pair however often the line repeats",
          }}
        />
        <Kpi
          label="Resolution"
          value={`${(calls.stats.coverage * 100).toFixed(calls.stats.coverage === 1 ? 0 : 1)}%`}
          sub={
            calls.unresolved.length
              ? `${plural(calls.unresolved.length, "call")} land nowhere we can name`
              : "every call site placed"
          }
          verdict={
            calls.stats.coverage > 0.9
              ? {
                  label: "most of it",
                  tone: "fine",
                  why: "the rest is dynamic, or a global this build does not know",
                }
              : {
                  label: "partial",
                  tone: "watch",
                  why: "a large share of call sites resolve to nothing, so read the tables below as a floor rather than the whole picture",
                }
          }
        />
        <Kpi
          label="Unreachable"
          value={num(dead.length)}
          sub={`${plural(deadLines, "line")} nothing arrives at`}
          verdict={deadOf(deadLines, declaredLines)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Tabs tabs={KINDS} value={kind} onChange={setKind} />
        <Tabs className="ml-auto" tabs={ROOTS} value={roots} onChange={setRoots} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Only exported"
          value={num(only.length)}
          sub="handed out, never called in here"
          verdict={{
            label: roots === ROOTS[0] ? "counted as reached" : "counted as dead",
            tone: "plain",
            why: "an export nothing here calls is either a public surface or a leftover, and only you know which. The switch above decides how the tables read it",
          }}
        />
        <Kpi
          label="Most called"
          value={busiest ? num(busiest.callers.length) : "0"}
          sub={busiest ? `callers of ${busiest.name}` : "nothing is called twice"}
          verdict={{
            label: busiest ? shortPath(busiest.file, 24) : "none",
            tone: "plain",
            why: "the declaration the most others reach for. Changing its behaviour reaches every one of them",
          }}
        />
        <Kpi
          label="Recursion"
          value={num(loops.length)}
          sub={
            loops.length
              ? `${plural(
                  loops.reduce((sum, ring) => sum + ring.length, 0),
                  "declaration",
                )} in rings`
              : "no two declarations call each other"
          }
          verdict={{
            label: loops.length ? `biggest ${Math.max(...loops.map((r) => r.length))}` : "none",
            tone: "plain",
            why: "declarations that call each other round a ring. A call to itself is not recorded, so every ring here spans at least two",
          }}
        />
        <Kpi
          label="Repeated names"
          value={num(repeated.length)}
          sub={`declared in ${plural(new Set(repeated.flatMap((t) => t.files)).size, "file")}`}
          verdict={{
            label: repeated[0] ? `${repeated[0].name} in ${repeated[0].files.length}` : "none",
            tone: "plain",
            why: "the same name declared in more than one file. Sometimes a convention, sometimes the same code written twice: the table below says which files, you say which it is",
          }}
        />
      </div>

      <DataTable
        title="Declarations"
        hint="sort by callers for what everything leans on, by calls and lines for what does too much"
        rows={[...shown].sort((a, b) => b.callers.length - a.callers.length || b.lines - a.lines)}
        id={(s) => s.id}
        columns={columns}
        onRowClick={(s) => walk(s.file)}
        fold={12}
        file="declarations"
      >
        <Input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder={`Search ${num(declared.length)} names`}
          className="ml-auto w-44"
        />
      </DataTable>

      {dead.length > 0 && (
        <DataTable
          title="Nothing arrives at these"
          hint={
            roots === ROOTS[0]
              ? "no path from any file's top level or any export reaches them"
              : "no path from any file's top level reaches them, exports included"
          }
          rows={[...dead].sort((a, b) => b.lines - a.lines)}
          id={(s) => s.id}
          columns={DEAD}
          onRowClick={(s) => walk(s.file)}
          fold={12}
          file="unreachable"
        />
      )}

      {only.length > 0 && (
        <DataTable
          title="Handed out, never called here"
          hint="exported, and nothing in this repo reaches for it: a public surface, or an export nobody took up"
          rows={[...only].sort((a, b) => b.lines - a.lines)}
          id={(s) => s.id}
          columns={ONLY}
          onRowClick={(s) => walk(s.file)}
          fold={12}
          file="only-exported"
        />
      )}

      {lost.length > 0 && (
        <DataTable
          title="Calls we could not place"
          hint="a name used like a call that resolves to nothing here: a prop from an enclosing component, a global we do not know, or prose that reads like code"
          rows={lost}
          id={(row) => row.name}
          columns={LOST}
          fold={8}
          file="unresolved"
        />
      )}

      {repeated.length > 0 && (
        <DataTable
          title="Names declared in more than one file"
          hint="the same name in several files: a convention, or the same code written twice"
          rows={repeated}
          id={(row) => row.name}
          columns={TWINS}
          fold={10}
          file="repeated-names"
        />
      )}

      {loops.length > 0 && (
        <Card>
          <CardHead
            title="Declarations that call each other"
            hint="a ring of calls, so no one of them can be read on its own"
          >
            <CopyButton
              className="ml-auto"
              label="Copy every ring, as text"
              text={() => loops.map((ring) => ring.map(named).join(" -> ")).join("\n")}
              message={`Copied ${plural(loops.length, "ring")}`}
              note="Each ring, in call order"
            />
          </CardHead>
          <CardContent className="flex flex-col gap-2">
            {loops.map((ring) => (
              <div
                key={ring.join()}
                className="flex flex-wrap items-center gap-1 border-t pt-2 first:border-0"
              >
                <span className="text-muted-foreground w-28 shrink-0 text-xs">
                  {plural(ring.length, "declaration")}
                </span>
                {ring.map((id) => (
                  <Tip key={id} text={fileOf(id)}>
                    <button
                      onClick={() => walk(fileOf(id))}
                      className="cursor-pointer rounded-md border border-amber-500/60 px-2 py-0.5 font-mono text-xs"
                    >
                      {named(id)}
                    </button>
                  </Tip>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Onward stats={stats} current="Execution" onTab={onTab} />
    </div>
  )
}

const WHAT: Column<Symbol>[] = [
  {
    key: "name",
    label: "Declaration",
    get: (s) => s.name,
    cell: (s) => <span className="font-mono text-xs">{s.name}</span>,
  },
  {
    key: "file",
    label: "File",
    get: (s) => s.file,
    cell: (s) => (
      <Tip className="max-w-64 min-w-0" text={s.file}>
        <span className="text-muted-foreground block truncate font-mono text-xs">
          {shortPath(s.file, 36)}
        </span>
      </Tip>
    ),
  },
  {
    key: "kind",
    label: "Kind",
    get: (s) => s.kind,
    cell: (s) => <span className="text-muted-foreground text-xs">{s.kind}</span>,
  },
]

const COUNTS: Column<Symbol>[] = [
  {
    key: "callers",
    label: "Callers",
    num: true,
    get: (s) => s.callers.length,
    hint: "how many other declarations reach for it, so what a change to it costs",
  },
  {
    key: "calls",
    label: "Calls",
    num: true,
    get: (s) => s.calls.length,
    hint: "how many it reaches for itself. A high count next to a high line count is the one that does everything",
  },
  {
    key: "lines",
    label: "Lines",
    num: true,
    get: (s) => s.lines,
    hint: "lines its body spans, brace to brace",
  },
  {
    key: "packages",
    label: "Packages",
    num: true,
    get: (s) => s.packages.length,
    hint: "installed packages it calls into, counted once each",
  },
  {
    key: "line",
    label: "At",
    num: true,
    flat: true,
    get: (s) => s.line,
    hint: "the line it is declared on",
  },
]

const ONLY: Column<Symbol>[] = [
  ...WHAT,
  {
    key: "lines",
    label: "Lines",
    num: true,
    get: (s) => s.lines,
    hint: "what unexporting it would put back inside the file, and deleting it would take out",
  },
  {
    key: "calls",
    label: "Calls",
    num: true,
    get: (s) => s.calls.length,
    hint: "what it reaches for, which goes with it",
  },
  {
    key: "line",
    label: "At",
    num: true,
    flat: true,
    get: (s) => s.line,
  },
]

const DEAD: Column<Symbol>[] = [
  ...WHAT,
  {
    key: "lines",
    label: "Lines",
    num: true,
    get: (s) => s.lines,
    hint: "what deleting it would take out",
  },
  {
    key: "calls",
    label: "Calls",
    num: true,
    get: (s) => s.calls.length,
    hint: "what it reaches for. Deleting it may leave those unreached in turn, so read this table again after",
  },
  {
    key: "exported",
    label: "Exported",
    get: (s) => (s.exported ? "yes" : "no"),
    cell: (s) =>
      s.exported ? (
        <Tip text="handed out, and still nothing here or in any export chain arrives at it">
          <span className="underline decoration-dotted">yes</span>
        </Tip>
      ) : (
        <span className="text-muted-foreground">no</span>
      ),
    hint: "an unexported one cannot be reached from outside either, so it is dead with nothing left to check",
  },
  {
    key: "line",
    label: "At",
    num: true,
    flat: true,
    get: (s) => s.line,
  },
]

const LOST: Column<{ name: string; sites: number; from: string[] }>[] = [
  {
    key: "name",
    label: "Name",
    get: (row) => row.name,
    cell: (row) => <span className="font-mono text-xs">{row.name}</span>,
  },
  {
    key: "sites",
    label: "Sites",
    num: true,
    get: (row) => row.sites,
    hint: "how many places use that name like a call",
  },
  {
    key: "from",
    label: "Used in",
    get: (row) => row.from.join(", "),
    cell: (row) => (
      <Tip className="max-w-96 min-w-0" text={row.from.join("\n")}>
        <span className="text-muted-foreground block truncate font-mono text-xs">
          {row.from.map((one) => one.split("/").pop()).join(", ")}
        </span>
      </Tip>
    ),
  },
]

const TWINS: Column<{ name: string; files: string[]; lines: number }>[] = [
  {
    key: "name",
    label: "Name",
    get: (row) => row.name,
    cell: (row) => <span className="font-mono text-xs">{row.name}</span>,
  },
  {
    key: "files",
    label: "Files",
    num: true,
    get: (row) => row.files.length,
    hint: "how many files declare something by this name",
  },
  {
    key: "lines",
    label: "Lines",
    num: true,
    get: (row) => row.lines,
    hint: "every one of them added up, which is what a single one would replace",
  },
  {
    key: "where",
    label: "Declared in",
    get: (row) => row.files.join(", "),
    cell: (row) => (
      <Tip className="max-w-96 min-w-0" text={row.files.join("\n")}>
        <span className="text-muted-foreground block truncate font-mono text-xs">
          {row.files.map((file) => file.split("/").pop()).join(", ")}
        </span>
      </Tip>
    ),
  },
]
