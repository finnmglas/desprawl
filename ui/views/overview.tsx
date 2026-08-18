// owner: finn
// goal: show data

import { useEffect, useMemo, useState } from "react"
import { AiCard, traced } from "../components/molecules/panels/ai-card.tsx"
import { Avatar } from "../components/atoms/avatar.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { Section } from "../components/atoms/section.tsx"
import { DataTable, type Column } from "../components/molecules/panels/data-table.tsx"
import { METRICS } from "../lib/say/columns.ts"
import { Moved } from "../components/atoms/moved.tsx"
import { Mark } from "../components/molecules/mark.tsx"
import { Architecture } from "../components/molecules/graph/architecture.tsx"
import { DepsCard } from "../components/molecules/panels/deps-card.tsx"
import { Headline } from "../components/molecules/panels/headline.tsx"
import { Onward } from "../components/molecules/onward.tsx"
import { toast } from "../components/atoms/toast.tsx"
import { TestsCard } from "../components/molecules/panels/tests-card.tsx"
import { Commits } from "./commits.tsx"
import { Explorer } from "./explorer.tsx"
import { OverTime } from "./over-time.tsx"
import { Doing } from "../components/molecules/agent/doing.tsx"
import { Working } from "../components/atoms/working.tsx"
import { day, num, pct, plural } from "../lib/say/format.ts"
import { allTime, importGraph, isLive, movedIn } from "../lib/app/live.ts"
import { useGoing } from "../lib/app/going.tsx"
import { worked } from "../lib/app/people.ts"
import { Badge } from "../components/atoms/badge.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Tip } from "../components/atoms/tip.tsx"
import { balanced, fold } from "../../src/read/layers.ts"
import type { Graph } from "../../src/read/graph.ts"
import type { Move } from "../../src/facts/history.ts"
import type { Timeline } from "../../src/facts/samples.ts"
import type { Contributor, Node, Stats } from "../../src/read/model.ts"

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

// a name close enough to fold together, against one row per email git actually saw
const IDENTITY = ["by person", "by email"]

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
        <span className="min-w-0 truncate">{p.name}</span>
        {p.bot && (
          <Tip text={`signs its commits as ${p.bot}, not a person`}>
            <Badge variant="outline" className="shrink-0">
              {p.bot}
            </Badge>
          </Tip>
        )}
        {p.also && p.also.length > 0 && (
          <Tip text={`same name, folded in from ${p.also.join(", ")}`}>
            <span className="text-muted-foreground shrink-0 text-xs">
              +{plural(p.also.length, "email")}
            </span>
          </Tip>
        )}
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
  faces,
  metadata,
  onMetadata,
  repos = [],
}: {
  stats: Stats
  faces: Record<string, string>
  metadata: boolean
  onMetadata: (open: boolean) => void
  /** the repos in a fleet, so the architecture is drawn one per repo */
  repos?: string[]
}) {
  const { at, go } = useGoing()
  // each carries what was clicked into where it opens
  const onLang = (picked: string) => {
    if (at.lang === picked) {
      go({ lang: "", kind: "" })
      return toast("Cleared", "The tree is no longer shaded")
    }
    go({ lang: picked, kind: "", path: [], pick: "", tab: "Overview", panel: "tree_files" })
    toast(`Showing ${picked}`, "Each row is shaded by its share of that language")
  }
  // a panel here, so Files means scroll to it
  const onCard = (next: string, shade?: string) => {
    go(
      next === "Files"
        ? { tab: "Overview", panel: "tree_files", kind: shade ?? "", lang: "" }
        : { tab: next, panel: "" },
    )
    if (shade) toast(`Showing ${shade.toLowerCase()}`, "Each row is shaded by its share of them")
  }
  const onCommits = (from: string, to: string) => {
    go({ tab: "Overview", panel: "history_commits", from, to })
    if (from || to) toast("Showing those commits", `${from} to ${to}`)
  }
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

  const moved = stats.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const span = Math.round((Date.parse(stats.last) - Date.parse(stats.first)) / 86_400_000) + 1
  const name = stats.repo.split("/").filter(Boolean).pop() ?? "Repo"
  // an export can be published with the addresses stripped, and then the column says nothing
  const anon = stats.contributors.every((one) => !one.email)
  const [identity, setIdentity] = useState(IDENTITY[0])
  // moot once a time frame is picked below: that list is already one row per person
  const contributors = identity === IDENTITY[1] ? stats.identities : stats.contributors
  // one address each, so the switch would change nothing
  const folded = useMemo(() => {
    const key = (one: Contributor) => (one.email || one.name).toLowerCase()
    const people = stats.contributors.map(key).sort()
    const seats = (stats.identities ?? []).map(key).sort()
    return (
      !seats.length || (people.length === seats.length && people.every((k, i) => k === seats[i]))
    )
  }, [stats.contributors, stats.identities])

  return (
    <div className="contents">
      <Headline stats={stats} total={total} span={span} onCard={onCard} />

      {stats.files === 0 && (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nothing countable. Binaries or missing data?
          </CardContent>
        </Card>
      )}

      <Architecture
        name={name}
        stats={stats}
        graph={graph}
        units={units}
        repos={repos}
        faces={faces}
        worked={where}
        changed={changed}
        ranged={!!range}
        asking={asking}
        metadata={metadata}
        onMetadata={onMetadata}
      />

      {/* after what the repo is, before what happened to it */}
      <Section id="actions_overview">
        <Doing />
      </Section>

      <Explorer stats={stats} />

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
                ? `${contributors.length} people, addresses left out`
                : identity === IDENTITY[1]
                  ? `${contributors.length} identities by email`
                  : `${contributors.length} people, close names folded together`
          }
          file={did ? "contributors-in-range" : "contributors"}
          columns={people(
            did ? did.reduce((sum, one) => sum + one.commits, 0) : stats.commits,
            did ? did.reduce((sum, one) => sum + one.insertions + one.deletions, 0) : moved,
            faces,
            anon,
          )}
          rows={did ?? contributors}
          id={(p) => p.email || p.name}
        >
          {!did && !folded && (
            <div className="ml-auto flex items-center gap-2">
              <Tabs tabs={IDENTITY} value={identity} onChange={setIdentity} />
            </div>
          )}
        </DataTable>
      </Section>

      <Commits stats={stats} from={at.from} to={at.to} onRange={onCommits} faces={faces} />

      {/* an empty card saying no assistant touched this repo is a row of nothing */}
      {traced(stats.stack.ai) && (
        <Section id="ai_overview">
          <AiCard ai={stats.stack.ai} />
        </Section>
      )}

      <TestsCard />

      <DepsCard />

      <Onward stats={stats} current="Overview" />
    </div>
  )
}
