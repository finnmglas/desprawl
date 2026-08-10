// owner: finn
// goal: show data

import { useEffect, useMemo, useState } from "react"
import { AiCard } from "../components/ai-card.tsx"
import { Avatar } from "../components/avatar.tsx"
import { Card, CardContent } from "../components/card.tsx"
import { CardHead } from "../components/card-head.tsx"
import { DataTable, type Column } from "../components/data-table.tsx"
import { Kpi } from "../components/kpi.tsx"
import { METRICS } from "../lib/columns.ts"
import { Moved } from "../components/moved.tsx"
import { Mark } from "../components/mark.tsx"
import { Onward } from "../components/onward.tsx"
import { OverTime } from "./over-time.tsx"
import { StackCard } from "../components/stack-card.tsx"
import { Working } from "../components/working.tsx"
import { Waiting } from "../components/waiting.tsx"
import { System } from "../components/system.tsx"
import { day, num, pct, plural, tokens } from "../lib/format.ts"
import { commentsOf, contextOf, historyOf, sizeOf } from "../lib/verdict.ts"
import { allTime, importGraph, isLive, movedIn } from "../lib/live.ts"
import { worked } from "../lib/people.ts"
import { balanced, fold } from "../../src/layers.ts"
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
const people = (commits: number, moved: number, faces: Record<string, string>): Column<Contributor>[] => [
  {
    key: "name", label: "Name", get: (p) => p.name,
    cell: (p) => (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar name={p.name} email={p.email} found={faces[p.email.toLowerCase()]} />
        <span className="truncate">{p.name}</span>
      </span>
    ),
  },
  { key: "email", label: "Email", get: (p) => p.email },
  { key: "commits", label: "com", num: true, get: (p) => p.commits, cell: (p) => num(p.commits) },
  { key: "pct", label: "pct", num: true, get: (p) => p.commits / (commits || 1), cell: (p) => pct(p.commits, commits) },
  {
    key: "added", label: "added", num: true, get: (p) => p.insertions,
    cell: (p) => <Moved n={p.insertions} kind="ins" />,
  },
  {
    key: "removed", label: "removed", num: true, get: (p) => p.deletions,
    cell: (p) => <Moved n={p.deletions} kind="del" />,
  },
  { key: "churn", label: "churn", num: true, get: (p) => p.insertions + p.deletions, cell: (p) => pct(p.insertions + p.deletions, moved) },
  { key: "files", label: "files", num: true, get: (p) => p.files, cell: (p) => num(p.files) },
  { key: "first", label: "first", num: true, get: (p) => p.first, cell: (p) => day(p.first), flat: true },
  { key: "last", label: "last", num: true, get: (p) => p.last, cell: (p) => day(p.last), flat: true },
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
  onTab: (tab: string) => void
  /** hand the zoomed window to the history view */
  onCommits: (from: string, to: string) => void
  faces: Record<string, string>
  /** the metadata fold, kept in the saved settings so a reload does not close it */
  metadata: boolean
  onMetadata: (open: boolean) => void
}) {
  const [all, setAll] = useState<Timeline | null>(null)
  // who committed where, folded once rather than per card
  const where = useMemo(() => worked(stats.tree), [stats.tree])

  // the picture below needs the imports, which the modules tab would otherwise fetch alone
  const [graph, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
  }, [])

  // grouped once, so the window below can be folded onto the same groups
  const assign = useMemo(() => (graph ? balanced(graph) : null), [graph])
  const units = useMemo(
    () => (graph && assign ? fold(graph, assign).units.filter((u) => u.role === "source") : []),
    [graph, assign],
  )
  const [range, setRange] = useState<[string, string] | null>(null)
  const [changed, setChanged] = useState<Map<string, Move>>(new Map())
  const [asking, setAsking] = useState(false)
  // the same window, folded onto the people panel: who was actually there then
  const [did, setDid] = useState<Contributor[] | null>(null)
  useEffect(() => {
    // a file has no server to ask what moved, so it keeps the picture it was made with
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

  // a second pass, so it lands after paint
  useEffect(() => {
    if (stats.truncated) void allTime().then(setAll)
  }, [stats.truncated])
  const total = all?.total ?? stats.commits

  const source = stats.code + stats.comment
  const moved = stats.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const span = Math.round((Date.parse(stats.last) - Date.parse(stats.first)) / 86_400_000) + 1

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* each card opens its tab */}
        {[
          {
            label: "Lines of code",
            value: num(stats.code),
            sub: `${num(stats.files)} files${stats.stack.primary ? `, primarily ${stats.stack.primary}` : ""}`,
            verdict: sizeOf(stats.code),
            to: "Files",
          },
          {
            label: "Comments",
            value: num(stats.comment),
            sub: `${pct(stats.comment, source)} of source`,
            verdict: commentsOf(stats.comment, source),
            to: "Files",
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
        ].map((card) => (
          <Kpi key={card.label} {...card} opens={card.to} onClick={() => onTab(card.to)} />
        ))}
      </div>

      {stats.files === 0 && (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nothing countable here. Every tracked file is binary, or has neither a known extension
            nor a name desprawl recognises, so there are no lines to report.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHead
          title={
            <span className="flex items-center gap-1">
              Project architecture
              <Working on={asking} />
            </span>
          }
          hint="the modules this repo holds, what each depends on, and the services it reaches outside itself"
        />
        <CardContent>
          {graph ? (
            <System
              name={stats.repo.split("/").filter(Boolean).pop() ?? "this repo"}
              moved={range && isLive() ? changed : undefined}
              people={stats.contributors}
              worked={where}
              faces={faces}
              units={units}
              stack={stats.stack}
              onPick={() => onTab("Modules")}
            />
          ) : (
            <Waiting
              what="Reading every import in the repo,"
              slow="A large repo takes a few seconds. The answer is held after that."
            />
          )}
          {range && !isLive() && (
            <p className="text-muted-foreground mt-3 text-xs">
              A window needs the repo to answer for those days, and a saved page has no server. Run
              desprawl on the repo to paint one.
            </p>
          )}
          <StackCard stack={stats.stack} folded open={metadata} onOpen={onMetadata} />
        </CardContent>
      </Card>

      <OverTime
        stats={stats}
        all={all}
        onCommits={onCommits}
        onZoom={(from, to) => setRange(from && to ? [from, to] : null)}
      />

      <DataTable
        title="Languages"
        hint="Click one to see where it lives"
        columns={LANGS}
        rows={stats.languages}
        id={(l) => l.name}
        fold={8}
        onRowClick={(l) => onLang(l.name)}
        total={{ ...stats.tree, name: "total" }}
      />

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
            : `${stats.contributors.length} identities, merged by mailmap email`
        }
        file={did ? "contributors-in-range" : "contributors"}
        columns={people(
          did ? did.reduce((sum, one) => sum + one.commits, 0) : stats.commits,
          did ? did.reduce((sum, one) => sum + one.insertions + one.deletions, 0) : moved,
          faces,
        )}
        rows={did ?? stats.contributors}
        id={(p) => p.email}
        fold={8}
      />

      <AiCard ai={stats.stack.ai} />

      <Onward stats={stats} current="Overview" onTab={onTab} />
    </div>
  )
}
