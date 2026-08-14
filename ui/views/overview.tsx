// owner: finn
// goal: show data

import { useEffect, useMemo, useRef, useState } from "react"
import { AiCard } from "../components/molecules/ai-card.tsx"
import { Avatar } from "../components/atoms/avatar.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import { Section } from "../components/atoms/section.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { REGISTRIES, linkTo } from "../../src/registries.ts"
import { Kpi, Kpis } from "../components/molecules/kpi.tsx"
import { METRICS } from "../lib/columns.ts"
import { Moved } from "../components/atoms/moved.tsx"
import { Mark } from "../components/molecules/mark.tsx"
import { Onward } from "../components/molecules/onward.tsx"
import { OverTime } from "./over-time.tsx"
import { StackCard } from "../components/molecules/stack-card.tsx"
import { Doing } from "../components/molecules/doing.tsx"
import { Working } from "../components/atoms/working.tsx"
import { Waiting } from "../components/atoms/waiting.tsx"
import { System } from "../components/molecules/system.tsx"
import { wall } from "../../src/system.ts"
import { Save } from "../components/molecules/save.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { ago, day, num, pct, plural, tokens, weight } from "../lib/format.ts"
import {
  commentsOf,
  contextOf,
  coverageOf,
  historyOf,
  familyOf,
  OUTLINE,
  shapeOf,
  sizeOf,
  suiteOf,
  worst,
  RANK,
  TONES,
} from "../lib/verdict.ts"
import { allTime, importGraph, isLive, movedIn } from "../lib/live.ts"
import { worked } from "../lib/people.ts"
import { dependencies, runTests, testSuite } from "../lib/live.ts"
import { Button } from "../components/atoms/button.tsx"
import { toast } from "../components/atoms/toast.tsx"
import { cn } from "../lib/ui.ts"
import { Badge } from "../components/atoms/badge.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Tip } from "../components/atoms/tip.tsx"
import { balanced, fold } from "../../src/layers.ts"
import type { Dep, Deps } from "../../src/deps.ts"
import type { Suite } from "../../src/tests.ts"
import type { Verdict } from "../lib/verdict.ts"
import type { Graph } from "../../src/graph.ts"
import type { Move, Timeline } from "../../src/history.ts"
import type { Contributor, Node, Stats } from "../../src/model.ts"

const LANGS: Column<Node>[] = [
  {
    key: "name",
    label: "Language",
    get: (l) => l.name,
    cell: (l) => (
      <span className="flex items-center gap-2">
        <Mark label={l.name} />
        {l.name}
      </span>
    ),
  },
  ...METRICS,
]

// prettier-ignore
/** the pinned row at the bottom, which answers for the list rather than for a package */
type Row = Dep & { every?: Dep[] }

/** one number with what it is and where it came from, since a lone number explains nothing */
const Fact = ({
  label,
  value,
  note,
  verdict,
}: {
  label: string
  value: string
  note: string
  verdict?: Verdict
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      {label}
      {verdict && (
        <Tip text={verdict.why} side="bottom">
          <span
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", TONES[verdict.tone])}
          >
            {verdict.label}
          </span>
        </Tip>
      )}
    </span>
    <span className="text-lg font-semibold tabular-nums">{value}</span>
    <span className="text-muted-foreground truncate text-[11px]">{note}</span>
  </div>
)

// what this repo asked for, against everything that arrived with it
const SCOPE = ["direct deps", "all deps"]

/** two years without a release: not dead, but worth knowing before leaning on it */
const quiet = (released: string) => !!released && Date.now() - Date.parse(released) > 730 * 864e5

const FAMILY: Record<string, string> = {
  permissive: OUTLINE.good,
  weak: OUTLINE.warn,
  strong: OUTLINE.bad,
  closed: "border-foreground/40",
  unknown: OUTLINE.quiet,
}

const WHERE: Column<Row> = {
  key: "ecosystem",
  label: "Registry",
  get: (one) => one.ecosystem,
  cell: (one) =>
    one.every ? (
      <span className="text-muted-foreground">
        {new Set(one.every.map((d) => d.ecosystem)).size} of them
      </span>
    ) : (
      <span className="text-muted-foreground text-xs">
        {REGISTRIES[one.ecosystem]?.label ?? one.ecosystem}
      </span>
    ),
  hint: "which package registry it is installed from, since a repo of several languages draws from several",
}

const DEPS: Column<Row>[] = [
  {
    key: "name",
    label: "Package",
    get: (one) => one.name,
    cell: (one) =>
      one.every ? (
        <span className="font-medium">{plural(one.every.length, "package")}</span>
      ) : (
        <a
          href={linkTo(one.name, one.ecosystem)}
          target="_blank"
          rel="noreferrer"
          title={`${one.name} on ${REGISTRIES[one.ecosystem]?.label ?? one.ecosystem}`}
          className="hover:text-foreground underline decoration-dotted"
        >
          {one.name}
        </a>
      ),
  },
  {
    key: "version",
    label: "Version",
    get: (one) => one.version || one.range,
    cell: (one) =>
      one.every ? (
        <span className="text-muted-foreground">
          {new Set(one.every.map((d) => d.name)).size} named
        </span>
      ) : (
        <Tip
          text={
            one.version
              ? `${one.range} in the manifest, ${one.version} on disk`
              : "not installed here, so the range is all there is"
          }
        >
          <span className="font-mono text-xs">{one.version || one.range}</span>
        </Tip>
      ),
    hint: "installed, or what the manifest asks for",
  },
  {
    key: "license",
    label: "Licence",
    get: (one) => one.license || "unknown",
    cell: (one) => {
      if (!one.every)
        return one.license ? (
          <Badge variant="outline" className={FAMILY[familyOf(one.license)]}>
            {one.license}
          </Badge>
        ) : (
          <span className="text-muted-foreground">unknown</span>
        )
      // what the whole list asks of the code around it, counted rather than judged
      const by = new Map<string, number>()
      for (const dep of one.every)
        by.set(familyOf(dep.license), (by.get(familyOf(dep.license)) ?? 0) + 1)
      const named = new Map<string, number>()
      for (const dep of one.every)
        named.set(dep.license || "unknown", (named.get(dep.license || "unknown") ?? 0) + 1)
      return (
        <Tip
          text={[...named]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => `${name}: ${n}`)
            .join(" · ")}
        >
          <span className="flex flex-wrap gap-1">
            {(["permissive", "weak", "strong", "closed", "unknown"] as const)
              .filter((kind) => by.get(kind))
              .map((kind) => (
                <Badge key={kind} variant="outline" className={FAMILY[kind]}>
                  {by.get(kind)} {kind}
                </Badge>
              ))}
          </span>
        </Tip>
      )
    },
    hint: "off the installed package, never guessed. Permissive asks for attribution, weak asks for changes to the package back, strong asks about the code around it, closed licensed you nothing",
  },
  {
    key: "bytes",
    label: "Size",
    num: true,
    get: (one) => (one.every ? one.every.reduce((n, d) => n + d.bytes, 0) : one.bytes),
    cell: (one) => {
      const bytes = one.every ? one.every.reduce((n, d) => n + d.bytes, 0) : one.bytes
      return bytes ? (
        <Tip
          text={
            one.every
              ? "every package here added up, each counted once"
              : "its own files, without whatever it installed under itself"
          }
        >
          <span>{weight(bytes)}</span>
        </Tip>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
    hint: "its own files on disk: what it pulled in weighs its own row",
  },
  {
    key: "released",
    label: "Last release",
    num: true,
    flat: true,
    get: (one) => one.released.slice(0, 10),
    cell: (one) => {
      if (one.every)
        return (
          <span className="text-muted-foreground">
            {one.every.filter((d) => quiet(d.released)).length} over 2 years
          </span>
        )
      if (!one.released)
        return (
          <Tip text="asked for the packages this repo names, not for everything they pull in">
            <span className="text-muted-foreground">—</span>
          </Tip>
        )
      return (
        <Tip text={`npm last published anything for it on ${day(one.released)}`}>
          <span className={quiet(one.released) ? "text-amber-600 dark:text-amber-400" : ""}>
            {ago(one.released)}
          </span>
        </Tip>
      )
    },
    hint: "when npm last saw a release, for the packages this repo names. Two quiet years is worth a look, not a verdict",
  },
  {
    key: "used",
    label: "This version",
    num: true,
    flat: true,
    get: (one) => one.used.slice(0, 10),
    cell: (one) => {
      if (one.every) {
        const behind = one.every.filter((d) => d.latest && d.version !== d.latest).length
        return <span className="text-muted-foreground">{behind} behind</span>
      }
      if (!one.used)
        return (
          <Tip text="asked for the packages this repo names, not for everything they pull in">
            <span className="text-muted-foreground">—</span>
          </Tip>
        )
      const stale = !!one.latest && one.version !== one.latest
      return (
        <Tip
          text={`${one.version} was published on ${day(one.used)}${stale ? `, and ${one.latest} is out` : ", which is the newest there is"}`}
        >
          <span>{ago(one.used)}</span>
        </Tip>
      )
    },
    hint: "when the installed version was published. Hover says whether a newer one is out",
  },
  {
    key: "kind",
    label: "Imported by",
    get: (one) => (one.direct ? (one.dev ? "dev" : "prod") : "indirectly"),
    cell: (one) =>
      one.every ? (
        <span className="text-muted-foreground">
          {one.every.filter((d) => d.direct).length} named
        </span>
      ) : one.direct ? (
        <Tip text={one.dev ? "a dev dependency, so it never ships" : "named in package.json"}>
          <Badge variant="outline">{one.dev ? "dev" : "prod"}</Badge>
        </Tip>
      ) : (
        <Tip text="nothing here asked for it, something it depends on did">
          <span className="text-muted-foreground">indirectly</span>
        </Tip>
      ),
    hint: "whether this repo names it, and whether anything that ships reaches it. Read through the whole tree, so what a dev package pulls in is dev too",
  },
  {
    key: "advisories",
    label: "Security issues",
    num: true,
    flat: true,
    good: true,
    get: (one) => one.advisories.length,
    cell: (one) =>
      one.every ? (
        <span className={one.every.some((d) => d.advisories.length) ? "" : "text-muted-foreground"}>
          {one.every.reduce((n, d) => n + d.advisories.length, 0)} on{" "}
          {one.every.filter((d) => d.advisories.length).length}
        </span>
      ) : one.advisories.length ? (
        <Tip
          text={
            <>
              {one.advisories.slice(0, 4).map((a) => (
                <span key={a.id} className="block">
                  {a.id}: {a.summary}
                </span>
              ))}
              {one.advisories.length > 4 && <>and {one.advisories.length - 4} more</>}
            </>
          }
        >
          <a
            href={one.advisories[0].url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "underline decoration-dotted",
              worst(one.advisories) === "CRITICAL" || worst(one.advisories) === "HIGH"
                ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {one.advisories.length} {worst(one.advisories).toLowerCase()}
          </a>
        </Tip>
      ) : (
        <span className="text-muted-foreground">none</span>
      ),
    hint: "open sec issues for this version, from osv.dev",
  },
]

const people = (
  commits: number,
  moved: number,
  faces: Record<string, string>,
  anon: boolean,
): Column<Contributor>[] => [
  {
    key: "name",
    label: "Name",
    get: (p) => p.name,
    cell: (p) => (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar name={p.name} email={p.email} found={faces[p.email.toLowerCase()]} />
        <span className="truncate">{p.name}</span>
      </span>
    ),
  },
  ...(anon ? [] : [{ key: "email", label: "Email", get: (p: Contributor) => p.email }]),
  { key: "commits", label: "com", num: true, get: (p) => p.commits, cell: (p) => num(p.commits) },
  {
    key: "pct",
    label: "pct",
    num: true,
    get: (p) => p.commits / (commits || 1),
    cell: (p) => pct(p.commits, commits),
  },
  {
    key: "added",
    label: "added",
    num: true,
    get: (p) => p.insertions,
    cell: (p) => <Moved n={p.insertions} kind="ins" />,
  },
  {
    key: "removed",
    label: "removed",
    num: true,
    get: (p) => p.deletions,
    cell: (p) => <Moved n={p.deletions} kind="del" />,
  },
  {
    key: "churn",
    label: "churn",
    num: true,
    get: (p) => p.insertions + p.deletions,
    cell: (p) => pct(p.insertions + p.deletions, moved),
  },
  { key: "files", label: "files", num: true, get: (p) => p.files, cell: (p) => num(p.files) },
  {
    key: "first",
    label: "first",
    num: true,
    get: (p) => p.first,
    cell: (p) => day(p.first),
    flat: true,
  },
  {
    key: "last",
    label: "last",
    num: true,
    get: (p) => p.last,
    cell: (p) => day(p.last),
    flat: true,
  },
]

export function Overview({
  stats,
  onLang,
  onTab,
  onCommits,
  faces,
  metadata,
  onMetadata,
}: {
  stats: Stats
  onLang: (lang: string) => void
  /** a shade names the line kind the files tree should paint with, when the card is about one */
  onTab: (tab: string, shade?: string) => void
  onCommits: (from: string, to: string) => void
  faces: Record<string, string>
  metadata: boolean
  onMetadata: (open: boolean) => void
}) {
  const [all, setAll] = useState<Timeline | null>(null)
  const where = useMemo(() => worked(stats.tree), [stats.tree])

  // picture below needs the imports
  const [graph, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
  }, [])

  // group once, so a window folds onto the same groups
  const assign = useMemo(() => (graph ? balanced(graph) : null), [graph])
  const units = useMemo(
    () => (graph && assign ? fold(graph, assign).units.filter((u) => u.role === "source") : []),
    [graph, assign],
  )
  const [range, setRange] = useState<[string, string] | null>(null)
  const [changed, setChanged] = useState<Map<string, Move>>(new Map())
  const [asking, setAsking] = useState(false)
  // the same window, on the people panel
  const [did, setDid] = useState<Contributor[] | null>(null)
  useEffect(() => {
    if (!range || !assign || !isLive()) {
      setDid(null)
      return setChanged(new Map())
    }
    setAsking(true)
    void movedIn(range[0], range[1]).then(({ paths: files, people }) => {
      setAsking(false)
      setDid(
        Object.entries(people)
          .map(([seat, one]) => ({
            ...stats.contributors[Number(seat)],
            ...one,
            first: range[0],
            last: range[1],
          }))
          .filter((one) => one.name)
          .sort((a, b) => b.commits - a.commits),
      )
      const found = new Map<string, Move>()
      for (const [path, one] of Object.entries(files)) {
        const group = assign[path]
        if (!group) continue
        const at = found.get(group) ?? { up: 0, down: 0, by: {} }
        at.up += one.up
        at.down += one.down
        for (const [who, n] of Object.entries(one.by))
          at.by[Number(who)] = (at.by[Number(who)] ?? 0) + n
        found.set(group, at)
      }
      setChanged(found)
    })
  }, [range, assign])

  // second pass so it lands after paint
  useEffect(() => {
    if (stats.truncated) void allTime().then(setAll)
  }, [stats.truncated])
  const total = all?.total ?? stats.commits

  const source = stats.code + stats.comment
  const moved = stats.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const span = Math.round((Date.parse(stats.last) - Date.parse(stats.first)) / 86_400_000) + 1
  const name = stats.repo.split("/").filter(Boolean).pop() ?? "Repo"
  // an export can be published with the addresses stripped, and then the column says nothing
  const anon = stats.contributors.every((one) => !one.email)
  const wall_ = useRef<HTMLDivElement>(null)
  const [kit, setKit] = useState<Deps | null>(null)
  const [scope, setScope] = useState(SCOPE[0])
  const [hunt, setHunt] = useState("")
  // the scope decides which rows there are and the table searches within them: the totals
  // row is a prop rather than a row, so it has to be told what the search left
  const scoped = useMemo(
    () => (kit?.list ?? []).filter((one) => scope === SCOPE[1] || one.direct),
    [kit, scope],
  )
  // one registry needs no column saying so on every row, several do
  const columns = useMemo(() => {
    const many = new Set((kit?.list ?? []).map((one) => one.ecosystem)).size > 1
    return many ? [DEPS[0], DEPS[1], WHERE, ...DEPS.slice(2)] : DEPS
  }, [kit])
  const picked = useMemo(() => {
    const said = hunt.trim().toLowerCase()
    // the same match the table itself searches with, so the totals row agrees
    return said
      ? scoped.filter((one) =>
          columns.some((col) => String(col.get(one)).toLowerCase().includes(said)),
        )
      : scoped
  }, [scoped, hunt, columns])
  const [suite, setSuite] = useState<Suite | null>(null)
  const [running, setRunning] = useState("")
  useEffect(() => {
    void testSuite().then(setSuite)
  }, [])
  useEffect(() => {
    void dependencies().then(setKit)
  }, [])
  const count = (edges: Record<string, number>) =>
    Object.values(edges).reduce((sum, n) => sum + n, 0)

  return (
    <div className="flex flex-col gap-4">
      <Section id="kpis_overview">
        <Kpis>
          {[
            {
              label: "Lines of code",
              value: num(stats.code),
              sub: `${num(stats.files)} files${stats.stack.primary ? `, primarily ${stats.stack.primary}` : ""}`,
              verdict: sizeOf(stats.code),
              to: "Files",
              shade: "Code",
            },
            {
              label: "Comments",
              value: num(stats.comment),
              sub: `${pct(stats.comment, source)} of source`,
              verdict: commentsOf(stats.comment, source),
              to: "Files",
              shade: "Comments",
            },
            {
              label: "Tokens",
              value: `~${num(tokens(stats.chars))}`,
              sub: `${num(stats.chars)} chars`,
              verdict: contextOf(tokens(stats.chars)),
              to: "Files",
            },
            {
              label: "Commits",
              value: num(total),
              sub: stats.truncated
                ? `${plural(stats.contributors.length, "dev")} in the latest ${num(stats.commits)}`
                : `${plural(stats.contributors.length, "dev")} in ${plural(span, "day")}`,
              verdict: historyOf(total),
              to: "History",
            },
          ].map(({ shade, ...card }) => (
            <Kpi key={card.label} {...card} opens={card.to} onClick={() => onTab(card.to, shade)} />
          ))}
        </Kpis>
      </Section>

      {stats.files === 0 && (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nothing countable. Binaries or missing data?
          </CardContent>
        </Card>
      )}

      <Section id="system_overview">
        <Card>
          <CardHead
            title={
              <span className="flex items-center gap-1">
                Project architecture
                <Working on={asking} />
              </span>
            }
            hint="modules and services, generated from repo"
            wrap
          >
            {graph && units.length > 0 && (
              <div className="ml-auto flex items-center gap-1">
                <CopyButton
                  label="Copy the architecture, as text"
                  text={() => wall(name, units, stats.stack)}
                  message={`Copied ${plural(units.length, "group")}`}
                  note="Every band, its groups and what they talk to"
                />
                <Save
                  name="architecture"
                  picture={() => wall_.current}
                  rows={() => [
                    ["group", "name", "level", "files", "lines", "classification", "packages"],
                    ...units.map((u) => [
                      u.path,
                      u.path,
                      u.level,
                      u.files,
                      u.lines,
                      shapeOf(u.internal, count(u.out), count(u.in), Object.keys(u.out).length)
                        .label,
                      u.packages,
                    ]),
                  ]}
                  note={`${plural(units.length, "group")}, as`}
                />
              </div>
            )}
          </CardHead>
          <CardContent>
            <div ref={wall_}>
              {graph ? (
                <System
                  name={name}
                  moved={range && isLive() ? changed : undefined}
                  people={stats.contributors}
                  worked={where}
                  faces={faces}
                  units={units}
                  stack={stats.stack}
                  onPick={() => onTab("Modules")}
                />
              ) : (
                <Waiting what="Reading all imports," slow="Large repo takes a few seconds." />
              )}
            </div>
            {range && !isLive() && (
              <p className="text-muted-foreground mt-3 text-xs">Needs live npx desprawl server.</p>
            )}
            <StackCard stack={stats.stack} folded open={metadata} onOpen={onMetadata} />
          </CardContent>
        </Card>
      </Section>

      {/* after what the repo is, before what happened to it */}
      <Section id="actions_overview">
        <Doing />
      </Section>

      <Section id="timeline_overview">
        <OverTime
          stats={stats}
          all={all}
          onCommits={onCommits}
          onZoom={(from, to) => setRange(from && to ? [from, to] : null)}
        />
      </Section>

      <Section id="table_languages">
        <DataTable
          title="Languages"
          hint="Click to see files"
          columns={LANGS}
          rows={stats.languages}
          id={(l) => l.name}
          fold={8}
          onRowClick={(l) => onLang(l.name)}
          total={{ ...stats.tree, name: "total" }}
        />
      </Section>

      <Section id="table_contributors">
        <DataTable
          title={
            <span className="flex items-center gap-1">
              {did ? "Contributors (time frame)" : "Contributors"}
              <Working on={asking} />
            </span>
          }
          hint={
            did
              ? `${plural(did.length, "person")} committed between ${range?.[0]} and ${range?.[1]}`
              : anon
                ? `${stats.contributors.length} people, addresses left out`
                : `${stats.contributors.length} identities by email`
          }
          file={did ? "contributors-in-range" : "contributors"}
          columns={people(
            did ? did.reduce((sum, one) => sum + one.commits, 0) : stats.commits,
            did ? did.reduce((sum, one) => sum + one.insertions + one.deletions, 0) : moved,
            faces,
            anon,
          )}
          rows={did ?? stats.contributors}
          id={(p) => p.email || p.name}
          fold={8}
        />
      </Section>

      <Section id="ai_overview">
        <AiCard ai={stats.stack.ai} />
      </Section>

      {suite && (suite.files > 0 || suite.script) && (
        <Section id="card_tests">
          <Card>
            <CardHead
              title="Tests"
              hint={
                suite.runners.length
                  ? `${suite.runners.join(", ")}, counted by reading the files rather than running them`
                  : "no runner named in the manifest"
              }
            >
              {suite.script && isLive() && (
                <div className="ml-auto flex items-center gap-1">
                  {[
                    { label: suite.script, note: suite.command, cover: false },
                    ...(suite.measured || suite.measure
                      ? [
                          {
                            label: "with coverage",
                            note: suite.measure ? `the ${suite.measure} script` : suite.measured,
                            cover: true,
                          },
                        ]
                      : []),
                  ].map((one) => (
                    <Button
                      key={one.label}
                      variant="outline"
                      size="sm"
                      className="bg-card"
                      title={one.note}
                      disabled={!!running}
                      onClick={() => {
                        setRunning(one.label)
                        toast(`Running ${one.note}`, "the slow one, so it only runs on a click")
                        void runTests(suite.script, one.cover).then((made) => {
                          setRunning("")
                          if (made) setSuite(made)
                          toast(
                            made?.ran?.ok ? "Tests passed" : "Tests failed",
                            made?.ran ? `${made.ran.seconds}s, exit ${made.ran.code}` : "no answer",
                          )
                        })
                      }}
                    >
                      {running === one.label ? "running…" : one.label}
                    </Button>
                  ))}
                </div>
              )}
            </CardHead>
            <CardContent className="flex flex-col gap-3">
              {/* five facts, so four across leaves one alone on a second row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Fact
                  label="Suite"
                  value={suite.ran ? (suite.ran.ok ? "green" : "red") : "not run"}
                  note={
                    suite.ran
                      ? `${suite.ran.seconds}s, exit ${suite.ran.code}`
                      : "read, not run: press the button"
                  }
                  verdict={suiteOf(suite.ran, suite.cases)}
                />
                <Fact label="Test files" value={num(suite.files)} note="by folder and file name" />
                <Fact
                  label="Cases"
                  value={num(suite.cases)}
                  note="test and it calls, read off the code"
                />
                <Fact
                  label="Coverage"
                  value={suite.coverage ? `${suite.coverage.lines}%` : "—"}
                  note={
                    suite.coverage
                      ? `${suite.coverage.branches}% branches, ${suite.coverage.functions}% functions`
                      : "no report on disk, run the suite with coverage"
                  }
                  verdict={suite.coverage ? coverageOf(suite.coverage.lines) : undefined}
                />
                <Fact
                  label="Command"
                  value={suite.script || "none"}
                  note={suite.command || "no test script in the manifest"}
                />
              </div>
              {/* a file cannot run anything, and a number in one is as old as the file */}
              {!isLive() && (
                <p className="text-muted-foreground text-xs">
                  Counted when this page was saved, by reading the files rather than running them.
                  {suite.coverage
                    ? ` The coverage figure is whatever ${suite.covered} held at that moment.`
                    : " No coverage report was on disk then, so there is no figure to show."}{" "}
                  Running the suite needs a live desprawl:{" "}
                  <span className="font-mono">npx desprawl</span>
                  {suite.script && (
                    <>
                      {" "}
                      here, then the <span className="font-mono">{suite.script}</span> button.
                    </>
                  )}
                </p>
              )}
              {suite.ran && (
                <pre
                  className={cn(
                    "max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs",
                    suite.ran.ok ? "bg-muted" : "border-red-500/50",
                  )}
                >
                  {suite.ran.output || "(no output)"}
                </pre>
              )}
              {suite.ran && !isLive() && (
                <p className="text-muted-foreground text-xs">
                  That run happened before this page was saved, so it says what passed then, not
                  now.
                </p>
              )}
            </CardContent>
          </Card>
        </Section>
      )}

      {kit && kit.list.length > 0 && (
        <Section id="table_deps">
          <DataTable
            title="External dependencies"
            hint={
              kit.offline
                ? "licences from node_modules, check didn't reach osv.dev"
                : kit.missed
                  ? `${plural(picked.length, "package")}: osv.dev named ${kit.missed} advisories it then would not describe, so this column is short`
                  : `${plural(picked.length, "package")}, licences from disk, security from osv.dev on ${day(kit.checked)}`
            }
            // worst first
            onFind={setHunt}
            rows={[...scoped].sort(
              (a, b) =>
                b.advisories.length - a.advisories.length ||
                RANK.indexOf(worst(a.advisories)) - RANK.indexOf(worst(b.advisories)) ||
                a.name.localeCompare(b.name),
            )}
            // dupes
            id={(one) => `${one.name}@${one.version}`}
            columns={columns}
            total={{ ...kit.list[0], name: "", every: picked }}
            fold={8}
          >
            <div className="ml-auto flex items-center gap-2">
              <Tabs tabs={SCOPE} value={scope} onChange={setScope} />
            </div>
          </DataTable>
        </Section>
      )}

      <Onward stats={stats} current="Overview" onTab={onTab} />
    </div>
  )
}
