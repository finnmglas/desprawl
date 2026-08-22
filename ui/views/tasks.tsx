// owner: finn
// goal: everything the other tabs found, as work with a size on it

import { useEffect, useMemo, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { TOLL, spell, taskColumns } from "../components/molecules/panels/task-rows.tsx"
import { Face } from "../components/molecules/panels/hands.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { Dialog } from "../components/atoms/dialog.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { DataTable } from "../components/molecules/panels/data-table.tsx"
import { Fix } from "../components/molecules/agent/fix.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Agents } from "../components/molecules/agent/agents.tsx"
import { Section } from "../components/atoms/section.tsx"
import { Kpi, Kpis } from "../components/molecules/panels/kpi.tsx"
import { Loading, Onward } from "../components/molecules/onward.tsx"
import { Save } from "../components/molecules/save.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { callGraph, dependencies, importGraph, isLive, sprawlHere } from "../lib/app/live.ts"
import { isFile, useGoing } from "../lib/app/going.tsx"
import { useKept } from "../lib/app/kept.ts"
import { since } from "../lib/say/trend.ts"
import { useDisplay } from "../lib/app/display.tsx"
import { useWas } from "../lib/app/was.tsx"
import { hands, handsOf, worked } from "../lib/app/people.ts"
import { num, plural } from "../lib/say/format.ts"
import { FELT, IMPACTS, KINDS, tasks, type Task } from "../lib/say/tasks.ts"
import { balanced, fold } from "../../src/read/layers.ts"
import { cn } from "../lib/app/ui.ts"
import type { Calls } from "../../src/read/calls.ts"
import type { Deps } from "../../src/facts/deps.ts"
import type { Graph } from "../../src/read/graph.ts"
import type { Stats } from "../../src/read/model.ts"
import type { Sprawl } from "../../src/facts/work.ts"

const ALL = "everything"

export function Tasks({ stats, faces }: { stats: Stats; faces: Record<string, string> }) {
  const { open } = useGoing()
  const [graph, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  const [calls, setCalls] = useState<Calls | null>(window.__DESPRAWL_CALLS__ ?? null)
  const [deps, setDeps] = useState<Deps | null>(window.__DESPRAWL_DEPS__ ?? null)
  const [kind, setKind] = useKept("tasks.kind", ALL)
  const [find, setFind] = useKept("tasks.find", "")
  // a panel, not a jump into Files
  const [opened, setOpened] = useState<Task | null>(null)
  // a page has no disk, so the detectors are read on the other side
  const [text, setText] = useState<Sprawl | null>(window.__DESPRAWL_SPRAWL__ ?? null)
  const where = useMemo(() => worked(stats.tree), [stats.tree])
  // the tally is per folder
  const crewOf = (task: Task) => {
    const at = task.where.replace(/\/?\*$/, "")
    for (let path = at; path; path = path.split("/").slice(0, -1).join("/")) {
      const found = hands(path, where, stats.contributors)
      if (found.length) return found
    }
    // a task on package.json is the whole repo's, and the tree holds that tally
    return handsOf(stats.tree.by, stats.contributors)
  }

  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
    if (!calls) void callGraph().then(setCalls)
    if (!deps) void dependencies().then(setDeps)
    if (isLive()) void sprawlHere().then(setText)
  }, [])

  const layout = useMemo(() => (graph ? fold(graph, balanced(graph)) : null), [graph])
  const lines = useMemo(
    () => new Map(Object.values(graph?.modules ?? {}).map((one) => [one.path, one.lines])),
    [graph],
  )
  const found = useMemo(
    () => tasks(layout, calls, deps, lines, graph, text),
    [layout, calls, deps, lines, graph, text],
  )

  // the same list off the repo as it stood then. The dependencies are today's on both sides:
  // a checkout has no node_modules, so a licence task would read as brand new every time.
  // What is left moving is the code, which is what this tab is about
  const { compare } = useDisplay()
  const wasGraph = useWas("graph")?.graph
  const wasCalls = useWas("calls")?.calls
  const wasText = useWas("sprawl")?.sprawl ?? null
  const before = useMemo(() => {
    if (!wasGraph) return null
    const held = new Map(Object.values(wasGraph.modules).map((one) => [one.path, one.lines]))
    return tasks(
      fold(wasGraph, balanced(wasGraph)),
      wasCalls ?? null,
      deps,
      held,
      wasGraph,
      wasText,
    )
  }, [wasGraph, wasCalls, wasText, deps])

  if (!graph)
    return (
      <Loading
        stats={stats}
        current="Tasks"
        what="Reading what there is to do,"
        slow="It reads every graph first."
      />
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
  const of = (held: Task[]) => ({
    tasks: held.length,
    minutes: held.reduce((sum, one) => sum + one.minutes, 0),
    mechanical: held.filter((one) => one.mechanical).length,
    runtime: held.filter((one) => one.hits === "runtime").length,
  })
  const then = since(before && of(before), compare, of(found))
  // a file, a folder or the repo, so the panel says which
  const walk = (where: string) => {
    const at = where.replace(/\/?\*$/, "")
    open({ kind: isFile(at) ? "file" : "folder", id: at === "." ? "" : at })
  }

  const written = (one: Task) => {
    const crew = crewOf(one)
    return [
      `## ${one.title}`,
      "",
      one.why,
      "",
      `- Found by: ${one.kind}`,
      `- Impact: ${one.hits}, ${FELT[one.hits]}`,
      `- Where: \`${one.where}\``,
      ...(crew.length ? [`- Knows it: ${crew[0].who.name}`] : []),
      `- Clears ${num(one.reach)}, touches ${num(one.lines)} lines, about ${one.minutes}m of an agent`,
      `- Cure: ${one.mechanical ? "mechanical, an agent can finish it" : "a decision somebody has to make"}`,
      "",
      `Found by desprawl in ${stats.repo}`,
    ].join("\n")
  }

  const columns = taskColumns({ crewOf, faces })

  return (
    <div className="contents">
      <div className="flex flex-wrap items-center gap-2">
        <Back />
        {/* the table is what this repo needs doing, this is whatever you need doing */}
        <Fix className="ml-auto" label="Ask an agent" />
        <Save
          name="tasks"
          rows={() => [
            [
              "task",
              "found by",
              "where",
              "clears",
              "lines",
              "estimate minutes",
              "impact",
              "dev",
              "cure",
              "why",
            ],
            ...found.map((one) => [
              one.title,
              one.kind,
              one.where,
              one.reach,
              one.lines,
              one.minutes,
              one.hits,
              crewOf(one)[0]?.who.name ?? "",
              one.mechanical ? "known" : "judgement",
              one.why,
            ]),
          ]}
          note={`${plural(found.length, "task")}, as`}
        />
      </div>

      <Section id="kpis_tasks">
        <Kpis>
          <Kpi
            label="Tasks"
            value={num(found.length)}
            moved={then.tasks}
            says="tasks, dependencies aside,"
            sub={`from ${plural(new Set(found.map((one) => one.kind)).size, "kind")} of reading`}
            verdict={{
              label: found.length ? "collected" : "nothing found",
              tone: found.length ? "plain" : "fine",
              why: "every task the other tabs imply. Not a score: each row is a thing found, with what it takes",
            }}
          />
          <Kpi
            label="Estimated"
            value={spell(minutes)}
            // spelled the way the number above it is, or 5 beside 22.1h reads as five hours
            moved={then.minutes && { ...then.minutes, said: spell(Math.abs(then.minutes.by)) }}
            says="of it"
            sub="of an agent's time, all of it"
            verdict={{
              label: "a guess",
              tone: "plain",
              why: "the files each opens and the lines it reads, off two timed plan runs of 1.2 and 1.9 minutes. A fix writes too, so it counts as a few plans",
            }}
          />
          <Kpi
            label="Mechanical"
            value={num(easy.length)}
            moved={then.mechanical}
            says="mechanical tasks"
            sub={`${spell(easy.reduce((sum, one) => sum + one.minutes, 0))} of the total`}
            verdict={{
              label: found.length ? `${Math.round((easy.length / found.length) * 100)}%` : "none",
              tone: "plain",
              why: "the cure is known: a type import moves, a barrel import is renamed, dead code goes",
            }}
          />
          <Kpi
            label="Reaches anyone"
            value={num(found.filter((one) => one.hits === "runtime").length)}
            moved={then.runtime}
            says="tasks a user can feel"
            sub={`of ${plural(found.length, "task")}, the rest cost only us`}
            verdict={{
              label: IMPACTS.find((one) => found.some((task) => task.hits === one)) ?? "nothing",
              tone: found.some((one) => one.hits === "runtime") ? "watch" : "fine",
              why: "how many can be felt by somebody running this rather than working on it. The badge names the worst on the list",
            }}
          />
        </Kpis>
      </Section>

      <Section id="card_agents">
        <Agents />
      </Section>

      <Section id="table_tasks" className="flex flex-col gap-4">
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
          hint="sort Clears against Est. for what is worth doing first"
          rows={shown}
          id={(one) => one.id}
          columns={columns}
          onRowClick={setOpened}
          file="tasks"
        />
      </Section>

      <Dialog
        open={!!opened}
        onClose={() => setOpened(null)}
        className="max-w-lg gap-4"
        title={
          opened && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
                {opened.kind} · found by reading the repo
              </span>
              <span className="text-base leading-snug font-medium">{opened.title}</span>
            </div>
          )
        }
      >
        {opened && (
          <>
            <p className="text-muted-foreground text-sm leading-relaxed">{opened.why}</p>

            {/* the four numbers a person weighs it by, in one strip so they read across */}
            <div className="bg-muted/40 grid grid-cols-2 gap-px overflow-hidden rounded-md sm:grid-cols-4">
              {[
                [num(opened.reach), "clears"],
                [num(opened.lines), "lines"],
                [`${opened.minutes}m`, "an agent"],
                [opened.mechanical ? "known" : "a call", "the cure"],
              ].map(([value, label]) => (
                <div key={label} className="bg-card flex flex-col gap-0.5 px-3 py-2">
                  <span className="text-lg leading-none font-semibold tabular-nums">{value}</span>
                  <span className="text-muted-foreground text-[11px]">{label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground w-14 shrink-0 text-xs">Impact</span>
                <Badge variant="outline" className={TOLL[opened.hits]}>
                  {opened.hits}
                </Badge>
                <span className="text-muted-foreground min-w-0 text-xs">{FELT[opened.hits]}</span>
              </div>
              {crewOf(opened).length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 shrink-0 text-xs">Dev</span>
                  <Face of={crewOf(opened)} faces={faces} className="size-5" />
                  <span className="text-xs">
                    {crewOf(opened)[0].who.name}
                    <span className="text-muted-foreground"> has committed most where this is</span>
                  </span>
                </div>
              )}
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground w-14 shrink-0 text-xs">Where</span>
                <button
                  onClick={() => {
                    walk(opened.where)
                    setOpened(null)
                  }}
                  title="What is there, and where it leads"
                  className="hover:text-foreground hover:border-ring min-w-0 cursor-pointer truncate rounded border px-1.5 py-0.5 font-mono text-xs transition-colors"
                >
                  {opened.where}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t pt-3">
              <Fix task={opened} label="Hand it to an agent" />
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                it works here, and shows up under Agents
              </span>
              <CopyButton
                label="Copy this task, as markdown"
                text={() => written(opened)}
                message="Copied the task"
                note="Markdown, ready to paste into a ticket"
              />
            </div>
          </>
        )}
      </Dialog>

      <Onward stats={stats} current="Tasks" />
    </div>
  )
}
