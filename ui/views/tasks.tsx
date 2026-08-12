// owner: finn
// goal: everything the other tabs found, as work with a size on it

import { useEffect, useMemo, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { Fix } from "../components/molecules/fix.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Kpi } from "../components/molecules/kpi.tsx"
import { Onward } from "../components/molecules/onward.tsx"
import { Save } from "../components/molecules/save.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Tip } from "../components/atoms/tip.tsx"
import { Waiting } from "../components/atoms/waiting.tsx"
import { callGraph, dependencies, importGraph } from "../lib/live.ts"
import { num, plural, shortPath } from "../lib/format.ts"
import { KINDS, tasks, type Task } from "../lib/tasks.ts"
import { balanced, fold } from "../../src/layers.ts"
import { cn } from "../lib/ui.ts"
import type { Calls } from "../../src/calls.ts"
import type { Deps } from "../../src/deps.ts"
import type { Graph } from "../../src/graph.ts"
import type { Stats } from "../../src/model.ts"

const ALL = "everything"

const TONES: Record<string, string> = {
  broken: "border-red-500/60",
  security: "border-red-500/60",
  licence: "border-amber-500/60",
  cycle: "border-amber-500/60",
  dead: "border-sky-500/60",
  shape: "",
  size: "",
}

/** an hour is not 60 minutes to read, it is "an hour" */
const spell = (minutes: number) =>
  minutes < 90 ? `${Math.round(minutes)}m` : `${(minutes / 60).toFixed(1)}h`

export function Tasks({
  stats,
  onTab,
  onPath,
}: {
  stats: Stats
  onTab: (tab: string) => void
  onPath: (path: string[]) => void
}) {
  const [graph, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  const [calls, setCalls] = useState<Calls | null>(window.__DESPRAWL_CALLS__ ?? null)
  const [deps, setDeps] = useState<Deps | null>(window.__DESPRAWL_DEPS__ ?? null)
  const [kind, setKind] = useState(ALL)
  const [find, setFind] = useState("")

  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
    if (!calls) void callGraph().then(setCalls)
    if (!deps) void dependencies().then(setDeps)
  }, [])

  const layout = useMemo(() => (graph ? fold(graph, balanced(graph)) : null), [graph])
  const lines = useMemo(
    () => new Map(Object.values(graph?.modules ?? {}).map((one) => [one.path, one.lines])),
    [graph],
  )
  const found = useMemo(
    () => tasks(layout, calls, deps, lines, graph),
    [layout, calls, deps, lines, graph],
  )

  if (!graph)
    return (
      <div className="flex flex-col gap-4">
        <Back onTab={onTab} />
        <Card>
          <CardContent className="p-4">
            <Waiting
              what="Reading what there is to do,"
              slow="It reads every graph first."
              rows={4}
            />
          </CardContent>
        </Card>
        <Onward stats={stats} current="Tasks" onTab={onTab} />
      </div>
    )

  const hunted = find.trim().toLowerCase()
  const shown = found.filter(
    (one) =>
      (kind === ALL || one.kind === kind) &&
      (!hunted ||
        one.title.toLowerCase().includes(hunted) ||
        one.where.toLowerCase().includes(hunted)),
  )
  const minutes = found.reduce((sum, one) => sum + one.minutes, 0)
  const easy = found.filter((one) => one.mechanical)
  const walk = (where: string) =>
    onPath(
      where
        .replace(/\/?\*$/, "")
        .split("/")
        .filter(Boolean),
    )

  const columns: Column<Task>[] = [
    {
      key: "title",
      label: "Task",
      get: (one) => one.title,
      cell: (one) => (
        <Tip className="max-w-96 min-w-0" text={one.why}>
          <span className="block truncate">{one.title}</span>
        </Tip>
      ),
    },
    {
      key: "kind",
      label: "Found by",
      get: (one) => one.kind,
      cell: (one) => (
        <Badge variant="outline" className={TONES[one.kind]}>
          {one.kind}
        </Badge>
      ),
      hint: "which reading of the repo turned it up",
    },
    {
      key: "where",
      label: "Where",
      get: (one) => one.where,
      cell: (one) => (
        <Tip className="max-w-64 min-w-0" text={one.where}>
          <span className="text-muted-foreground block truncate font-mono text-xs">
            {one.where === "." ? "across the repo" : shortPath(one.where, 32)}
          </span>
        </Tip>
      ),
    },
    {
      key: "reach",
      label: "Clears",
      num: true,
      get: (one) => one.reach,
      hint: "how many things stop being wrong when it is done: files in the ring, packages exposed, folders untangled",
    },
    {
      key: "lines",
      label: "Lines",
      num: true,
      get: (one) => one.lines,
      hint: "what it would touch, which is the closest thing to a size there is before starting",
    },
    {
      key: "minutes",
      label: "Est.",
      num: true,
      get: (one) => one.minutes,
      cell: (one) => (
        <Tip text="minutes of an agent's time, from the files it opens and the lines it reads. Two plan runs on this machine were timed at 1.2 and 1.9 minutes, and everything here is scaled off those two numbers">
          <span className="underline decoration-dotted">{spell(one.minutes)}</span>
        </Tip>
      ),
      hint: "an agent's time, scaled off the two runs anybody has timed here rather than off a feeling. Sort by it against Clears to pick",
    },
    {
      key: "how",
      label: "Cure",
      get: (one) => (one.mechanical ? "known" : "judgement"),
      cell: (one) =>
        one.mechanical ? (
          <Tip text="the change itself is known, so it is the kind of thing an agent finishes">
            <span className="underline decoration-dotted">known</span>
          </Tip>
        ) : (
          <span className="text-muted-foreground">judgement</span>
        ),
      hint: "whether the fix is mechanical or a decision somebody has to make",
    },
    {
      key: "fix",
      label: "",
      flat: true,
      get: () => "",
      cell: (one) => <Fix task={one} />,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Back onTab={onTab} />
        <Save
          className="ml-auto"
          name="tasks"
          rows={() => [
            ["task", "found by", "where", "clears", "lines", "estimate minutes", "cure", "why"],
            ...found.map((one) => [
              one.title,
              one.kind,
              one.where,
              one.reach,
              one.lines,
              one.minutes,
              one.mechanical ? "known" : "judgement",
              one.why,
            ]),
          ]}
          note={`${plural(found.length, "task")}, as`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Tasks"
          value={num(found.length)}
          sub={`from ${plural(new Set(found.map((one) => one.kind)).size, "kind")} of reading`}
          verdict={{
            label: found.length ? "collected" : "nothing found",
            tone: found.length ? "plain" : "fine",
            why: "every task the other tabs imply, in one place. Nothing here is a score: each row is a thing that was found, with what it would take",
          }}
        />
        <Kpi
          label="Estimated"
          value={spell(minutes)}
          sub="of an agent's time, all of it"
          verdict={{
            label: "a guess",
            tone: "plain",
            why: "the files each one opens and the lines it reads, scaled off two timed plan runs of 1.2 and 1.9 minutes. A fix writes as well as reads, so it is taken as a few times a plan",
          }}
        />
        <Kpi
          label="Mechanical"
          value={num(easy.length)}
          sub={`${spell(easy.reduce((sum, one) => sum + one.minutes, 0))} of the total`}
          verdict={{
            label: found.length ? `${Math.round((easy.length / found.length) * 100)}%` : "none",
            tone: "plain",
            why: "the cure is already known for these: a type import moves, a barrel import is renamed, an unreachable declaration goes",
          }}
        />
        <Kpi
          label="Worst kind"
          value={KINDS.filter((one) => found.some((task) => task.kind === one))[0] ?? "none"}
          sub={`${num(found.filter((one) => one.kind === KINDS.find((k) => found.some((t) => t.kind === k))).length)} of them`}
          verdict={{
            label: "by severity",
            tone: "plain",
            why: "security first, then licence, then the structure ones. It is an order to read in, not a judgement of the repo",
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          tabs={[ALL, ...KINDS.filter((one) => found.some((task) => task.kind === one))]}
          value={kind}
          onChange={setKind}
        />
        <Input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder="Find"
          className={cn("ml-auto w-40")}
        />
      </div>

      <DataTable
        title="What there is to do"
        hint="sort by Clears against Est. to find the ones worth doing first"
        rows={shown}
        id={(one) => one.id}
        columns={columns}
        onRowClick={(one) => walk(one.where)}
        fold={14}
        file="tasks"
      />

      <Onward stats={stats} current="Tasks" onTab={onTab} />
    </div>
  )
}
