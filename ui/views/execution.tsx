// owner: finn
// goal: call graph analyzed

import { useEffect, useMemo, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Card, CardContent, Note } from "../components/atoms/card.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { Section } from "../components/atoms/section.tsx"
import { CallKpis } from "../components/molecules/graph/call-kpis.tsx"
import { DataTable, type Column } from "../components/molecules/panels/data-table.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Loading } from "../components/molecules/onward.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Path, Tip } from "../components/atoms/tip.tsx"
import { callGraph } from "../lib/app/live.ts"
import { symbol, useGoing } from "../lib/app/going.tsx"
import { useKept } from "../lib/app/kept.ts"
import { Button } from "../components/atoms/button.tsx"
import { num, plural, shortPath } from "../lib/say/format.ts"
import { REACHES, reachOf, reached, rings, twins } from "../../src/read/reach.ts"
import type { Calls, Symbol } from "../../src/read/calls.ts"
import type { Stats } from "../../src/read/model.ts"

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

  if (!calls)
    return <Loading stats={stats} current="Graph" what="Reading every call," onward={false} />

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
      </div>
    )

  const state = (symbol: Symbol) => reachOf(symbol, live)
  const dead = declared.filter((s) => state(s) === "dead")
  const only = declared.filter((s) => state(s) === "open")
  const deadLines = dead.reduce((sum, s) => sum + s.lines, 0)
  const declaredLines = declared.reduce((sum, s) => sum + s.lines, 0)
  const busiest = [...declared].sort((a, b) => b.callers.length - a.callers.length)[0]

  // already one row per name, most call sites first
  const lost = calls.unresolved

  // two languages are two pictures
  const langs = [...new Set(declared.map((s) => s.lang).filter(Boolean))].sort()
  const hunted = find.trim().toLowerCase()
  // a folder scopes to everything inside it
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
    // contents, so every panel here is an item of the tab that holds it
    <div className="contents">
      <CallKpis
        calls={calls}
        declared={declared}
        dead={dead}
        only={only}
        deadLines={deadLines}
        declaredLines={declaredLines}
        busiest={busiest}
        repeated={repeated}
        loops={loops}
        roots={roots}
        rooted={ROOTS[0]}
      />

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
          saves={[
            {
              name: "calls",
              label: "Every call",
              note: `${num(calls.stats.edges)} calls between ${num(calls.stats.symbols)} declarations, as`,
              rows: () => [
                ["from", "from file", "to", "to file"],
                ...all.flatMap((one) =>
                  one.calls.map((to) => [one.name, one.file, named(to), fileOf(to)]),
                ),
              ],
            },
          ]}
          onRowClick={walk}
          mark={(s) => s.id === atName}
          file="declarations"
        >
          {inFile && (
            <Button variant="outline" size="sm" onClick={() => go({ pick: "" })}>
              {inFile.split("/").pop()} ✕
            </Button>
          )}
          {/* these shape this table only */}
          <Tabs tabs={KINDS} value={kind} onChange={setKind} />
          {langs.length > 1 && <Tabs tabs={[KINDS[0], ...langs]} value={lang} onChange={setLang} />}
          <Input
            value={find}
            onChange={(event) => setFind(event.target.value)}
            placeholder={`Search ${num(declared.length)} names`}
            className="w-44"
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
          >
            {/* what counts as a starting point */}
            <Tabs tabs={ROOTS} value={roots} onChange={setRoots} />
          </DataTable>
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
