// owner: finn
// goal: call graph analyzed

import { useEffect, useMemo, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Card, CardContent, Note } from "../components/atoms/card.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { Section } from "../components/atoms/section.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Kpi, Kpis } from "../components/molecules/kpi.tsx"
import { Loading, Onward } from "../components/molecules/onward.tsx"
import { Save } from "../components/molecules/save.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Path, Tip } from "../components/atoms/tip.tsx"
import { callGraph } from "../lib/live.ts"
import { symbol, useGoing } from "../lib/going.tsx"
import { useKept } from "../lib/kept.ts"
import { Button } from "../components/atoms/button.tsx"
import { num, plural, shortPath } from "../lib/format.ts"
import { REACHES, reachOf, reached, rings, twins } from "../../src/reach.ts"
import { deadOf } from "../lib/verdict.ts"
import type { Calls, Symbol } from "../../src/calls.ts"
import type { Stats } from "../../src/model.ts"

const ROOTS = ["exports count", "entry points only"]
const KINDS = ["all", "function", "component", "class"]

const named = (id: string) => id.split("#").pop() ?? id
const fileOf = (id: string) => id.split("#")[0]

export function Execution({ stats }: { stats: Stats }) {
  const { at, go, open } = useGoing()
  const [calls, setCalls] = useState<Calls | null>(window.__DESPRAWL_CALLS__ ?? null)
  // set up here and still set when the reader comes back from another tab
  const [roots, setRoots] = useKept("calls.roots", ROOTS[0])
  const [kind, setKind] = useKept("calls.kind", KINDS[0])
  const [lang, setLang] = useKept("calls.lang", KINDS[0])
  const [find, setFind] = useKept("calls.find", "")

  useEffect(() => {
    if (!calls) void callGraph().then(setCalls)
  }, [])

  const live = useMemo(
    () => (calls ? reached(calls, roots === ROOTS[0]) : new Set<string>()),
    [calls, roots],
  )
  const repeated = useMemo(() => (calls ? twins(calls) : []), [calls])
  const loops = useMemo(() => (calls ? rings(calls) : []), [calls])

  if (!calls) return <Loading stats={stats} current="Execution" what="Reading every call," />

  const all = Object.values(calls.symbols)
  const declared = all.filter((s) => s.kind !== "module")
  if (!declared.length)
    return (
      <div className="flex flex-col gap-4">
        <Back />
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nothing declares a function or a class here, so there is no call graph to read.
          </CardContent>
        </Card>
        <Onward stats={stats} current="Execution" />
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

  // a repo of two languages is two pictures, and reading them apart is the only way to see either
  const langs = [...new Set(declared.map((s) => s.lang).filter(Boolean))].sort()
  const hunted = find.trim().toLowerCase()
  // arriving with something picked keeps only what is under it, since a table of four
  // thousand names is not an answer to having clicked one file. A folder scopes to
  // everything inside it rather than to whichever file inside it happened to come first
  const inFile = at.pick.split("#")[0].replace(/\/?\*$/, "")
  const scoped = (file: string) => !inFile || file === inFile || file.startsWith(`${inFile}/`)
  const shown = declared.filter(
    (s) =>
      scoped(s.file) &&
      (kind === KINDS[0] || s.kind === kind) &&
      (lang === KINDS[0] || s.lang === lang) &&
      (!hunted || s.name.toLowerCase().includes(hunted) || s.file.toLowerCase().includes(hunted)),
  )
  // the very declaration picked, when one was, rather than only the file holding it
  const atName = at.pick.includes("#") ? at.pick : ""
  const walk = (one: Symbol) => open(symbol(one.id, one.line, `${one.kind} in ${one.file}`))

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
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Back />
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

      <Section id="kpis_execution_general">
        <Kpis>
          <Kpi
            label="Declarations"
            value={num(declared.length)}
            sub={`${num(calls.stats.functions)} functions, ${num(calls.stats.components)} components, ${num(calls.stats.classes)} classes`}
            verdict={{
              label: `${plural(calls.stats.files, "file")}`,
              tone: "plain",
              why: "every top level function, class and component. A closure inside one belongs to it",
            }}
          />
          <Kpi
            label="Calls"
            value={num(calls.stats.edges)}
            sub={`${num(calls.stats.external)} into packages, ${num(calls.stats.builtin)} into the runtime`}
            verdict={{
              label: `${(calls.stats.edges / Math.max(1, declared.length)).toFixed(1)} each`,
              tone: "plain",
              why: "one declaration calling another, counted once per pair",
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
                    why: "many call sites resolve to nothing, so read the tables as a floor",
                  }
            }
          />
          <Kpi
            label="Unreachable"
            value={num(dead.length)}
            sub={`${plural(deadLines, "line")} nothing arrives at`}
            verdict={deadOf(deadLines, declaredLines)}
          />
        </Kpis>
      </Section>

      <Section id="kpis_execution_reach" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1">
          <Tabs tabs={KINDS} value={kind} onChange={setKind} />
          {langs.length > 1 && <Tabs tabs={[KINDS[0], ...langs]} value={lang} onChange={setLang} />}
          <Tabs className="ml-auto" tabs={ROOTS} value={roots} onChange={setRoots} />
        </div>

        <Kpis>
          <Kpi
            label="Only exported"
            value={num(only.length)}
            sub="handed out, never called in here"
            verdict={{
              label: roots === ROOTS[0] ? "counted as reached" : "counted as dead",
              tone: "plain",
              why: "an export nothing calls is a public surface or a leftover, and only you know which. The switch above decides how the tables read it",
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
              why: "declarations calling each other round a ring. Self calls are not recorded, so a ring spans two",
            }}
          />
          <Kpi
            label="Repeated names"
            value={num(repeated.length)}
            sub={`declared in ${plural(new Set(repeated.flatMap((t) => t.files)).size, "file")}`}
            verdict={{
              label: repeated[0] ? `${repeated[0].name} in ${repeated[0].files.length}` : "none",
              tone: "plain",
              why: "one name declared in several files. A convention, or the same code twice: the table says where, you say which",
            }}
          />
        </Kpis>
      </Section>

      <Section id="table_declarations">
        <DataTable
          title="Declarations"
          hint={
            inFile
              ? `every declaration in ${inFile}`
              : "sort by callers for what everything leans on, by calls and lines for what does too much"
          }
          rows={[...shown].sort((a, b) => b.callers.length - a.callers.length || b.lines - a.lines)}
          id={(s) => s.id}
          columns={columns}
          onRowClick={walk}
          mark={(s) => s.id === atName}
          file="declarations"
        >
          {inFile && (
            <Button variant="outline" size="sm" onClick={() => go({ pick: "" })}>
              {inFile.split("/").pop()} ✕
            </Button>
          )}
          <Input
            value={find}
            onChange={(event) => setFind(event.target.value)}
            placeholder={`Search ${num(declared.length)} names`}
            className="ml-auto w-44"
          />
        </DataTable>
      </Section>

      {dead.length > 0 && (
        <Section id="table_unreachable">
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
            onRowClick={walk}
            file="unreachable"
          />
        </Section>
      )}

      {only.length > 0 && (
        <Section id="table_only_exported">
          <DataTable
            title="Handed out, never called here"
            hint="exported, and nothing in this repo reaches for it: a public surface, or an export nobody took up"
            rows={[...only].sort((a, b) => b.lines - a.lines)}
            id={(s) => s.id}
            columns={ONLY}
            onRowClick={walk}
            file="only-exported"
          />
        </Section>
      )}

      {lost.length > 0 && (
        <Section id="table_unresolved">
          <DataTable
            title="Calls we could not place"
            hint="a name used like a call that resolves to nothing here: a prop from an enclosing component, a global we do not know, or prose that reads like code"
            rows={lost}
            id={(row) => row.name}
            columns={LOST}
            onRowClick={(row) =>
              open({
                kind: "file",
                id: row.from[0],
                name: row.name,
                note: `used like a call in ${plural(row.sites, "place")}, resolving to nothing here`,
                related: row.from,
                relation: "where it is used",
              })
            }
            file="unresolved"
          />
        </Section>
      )}

      {repeated.length > 0 && (
        <Section id="table_repeated_names">
          <DataTable
            title="Names declared in more than one file"
            hint="the same name in several files: a convention, or the same code written twice"
            rows={repeated}
            id={(row) => row.name}
            columns={TWINS}
            onRowClick={(row) =>
              open({
                kind: "file",
                id: row.files[0],
                name: row.name,
                note: `declared in ${plural(row.files.length, "file")}, ${num(row.lines)} lines between them`,
                related: row.files,
                relation: "the files declaring it",
              })
            }
            file="repeated-names"
          />
        </Section>
      )}

      {loops.length > 0 && (
        <Section id="card_recursion">
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
                        onClick={() => open(symbol(id))}
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
        </Section>
      )}

      <Onward stats={stats} current="Execution" />
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
    cell: (s) => <Path of={s.file} as={shortPath(s.file, 36)} />,
  },
  {
    key: "kind",
    label: "Kind",
    get: (s) => s.kind,
    cell: (s) => <Note>{s.kind}</Note>,
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
    hint: "how many it reaches. High beside a high line count is the one doing everything",
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
      <Path of={row.from.join("\n")} as={row.from.map((one) => one.split("/").pop()).join(", ")} />
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
      <Path
        of={row.files.join("\n")}
        as={row.files.map((file) => file.split("/").pop()).join(", ")}
      />
    ),
  },
]
