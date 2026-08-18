// owner: finn
// goal: a task as a row: what it is, where, and who knows it

import { Badge } from "../../atoms/badge.tsx"
import { Face, Hands } from "./hands.tsx"
import { Fix } from "../agent/fix.tsx"
import { Path, Tip } from "../../atoms/tip.tsx"
import { shortPath } from "../../../lib/say/format.ts"
import { OUTLINE } from "../../../lib/say/verdict.ts"
import type { Column } from "./data-table.tsx"
import { FELT, type Hits, type Task } from "../../../lib/say/tasks.ts"
import type { Hand } from "../../../lib/app/people.ts"

const TONES: Record<string, string> = {
  broken: "border-red-500/60",
  security: "border-red-500/60",
  licence: "border-amber-500/60",
  cycle: "border-amber-500/60",
  dead: "border-sky-500/60",
  copy: "",
  prose: "",
  shape: "",
  size: "",
}

/** an hour is not 60 minutes to read, it is "an hour" */
export const spell = (minutes: number) =>
  minutes < 90 ? `${Math.round(minutes)}m` : `${(minutes / 60).toFixed(1)}h`

export const TOLL: Record<Hits, string> = {
  runtime: OUTLINE.bad,
  shipping: OUTLINE.warn,
  "local dev": OUTLINE.cool,
  maintainability: OUTLINE.quiet,
}

interface What {
  /** who has touched what the task is about */
  crewOf: (task: Task) => Hand[]
  faces: Record<string, string>
}

export function taskColumns({ crewOf, faces }: What): Column<Task>[] {
  return [
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
      hint: "which reading turned it up",
    },
    {
      key: "where",
      label: "Where",
      get: (one) => one.where,
      cell: (one) => (
        <Path
          of={one.where}
          as={one.where === "." ? "across the repo" : shortPath(one.where, 32)}
        />
      ),
    },
    {
      key: "reach",
      label: "Clears",
      num: true,
      get: (one) => one.reach,
      hint: "what stops being wrong: files in the ring, packages exposed, folders untangled",
    },
    {
      key: "lines",
      label: "Lines",
      num: true,
      get: (one) => one.lines,
      hint: "the closest thing to a size before starting",
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
      hint: "an agent's time, off the two runs anybody has timed here. Sort against Clears to pick",
    },
    {
      key: "who",
      label: "Dev",
      get: (one) => crewOf(one)[0]?.who.name ?? "",
      cell: (one) => {
        const crew = crewOf(one)
        if (!crew.length) return null
        return (
          <Tip
            className="flex justify-center"
            side="bottom"
            text={<Hands of={crew} faces={faces} />}
          >
            <Face of={crew} faces={faces} />
          </Tip>
        )
      },
      hint: "who has committed most where this is",
    },
    {
      key: "hits",
      label: "Impact",
      get: (one) => one.hits,
      cell: (one) => (
        <Tip text={FELT[one.hits]}>
          <Badge variant="outline" className={TOLL[one.hits]}>
            {one.hits}
          </Badge>
        </Tip>
      ),
      hint: "who feels it if nobody does it. Not severity: a bloated folder and a dead export cost only us",
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
      hint: "mechanical, or a decision somebody makes",
    },
    {
      key: "fix",
      label: "",
      flat: true,
      get: () => "",
      cell: (one) => <Fix task={one} />,
    },
  ]
}
