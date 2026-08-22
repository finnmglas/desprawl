// owner: finn
// goal: what the list adds up to

import { Kpi, Kpis } from "./kpi.tsx"
import { Section } from "../../atoms/section.tsx"
import { num, plural } from "../../../lib/say/format.ts"
import { spell } from "./task-rows.tsx"
import { since } from "../../../lib/say/trend.ts"
import { useDisplay } from "../../../lib/app/display.tsx"
import { IMPACTS, type Task } from "../../../lib/say/tasks.ts"

/** the four numbers off any list of tasks, counted once for each date */
const of = (held: Task[]) => ({
  tasks: held.length,
  minutes: held.reduce((sum, one) => sum + one.minutes, 0),
  mechanical: held.filter((one) => one.mechanical).length,
  runtime: held.filter((one) => one.hits === "runtime").length,
})

export function TaskKpis({ found, before }: { found: Task[]; before: Task[] | null }) {
  const { compare } = useDisplay()
  const now = of(found)
  const then = since(before && of(before), compare, now)
  const easy = found.filter((one) => one.mechanical)
  return (
    <Section id="kpis_tasks">
      <Kpis>
        <Kpi
          label="Tasks"
          value={num(now.tasks)}
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
          value={spell(now.minutes)}
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
          value={num(now.mechanical)}
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
          value={num(now.runtime)}
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
  )
}
