// owner: finn
// goal: what the call graph came to, before any of the tables

import { Kpi, Kpis } from "../panels/kpi.tsx"
import { Section } from "../../atoms/section.tsx"
import { useMemo } from "react"
import { num, plural, shortPath } from "../../../lib/text/format.ts"
import { deadOf } from "../../../lib/text/verdict.ts"
import { since } from "../../../lib/text/trend.ts"
import { useDisplay } from "../../../lib/app/display.tsx"
import { useWas } from "../../../lib/app/was.tsx"
import { reachOf, reached, rings, twins } from "../../../../src/read/reach.ts"
import type { Calls, Symbol } from "../../../../src/read/calls.ts"

interface Props {
  calls: Calls
  /** everything but the modules themselves */
  declared: Symbol[]
  dead: Symbol[]
  only: Symbol[]
  deadLines: number
  declaredLines: number
  busiest?: Symbol
  /** bodies written more than once, and calls that come back around */
  repeated: { name: string; files: string[]; lines: number }[]
  loops: string[][]
  /** whether an export counts as a starting point */
  roots: string
  rooted: string
}

/** the same numbers off any reading, counted the way the view counts them */
function of(one: Calls, exports: boolean) {
  const live = reached(one, exports)
  const held = Object.values(one.symbols).filter((s) => s.kind !== "module")
  const state = (symbol: Symbol) => reachOf(symbol, live)
  return {
    declarations: held.length,
    calls: one.stats.edges,
    // resolution, not what failed: green means up, and up on a gap reads as praise
    resolution: Math.round(one.stats.coverage * 10_000) / 100,
    dead: held.filter((s) => state(s) === "dead").length,
    open: held.filter((s) => state(s) === "open").length,
    busiest: Math.max(0, ...held.map((s) => s.callers.length)),
    loops: rings(one).length,
    repeated: twins(one).length,
  }
}

export function CallKpis(props: Props) {
  const { calls, declared, dead, only, deadLines, declaredLines, busiest } = props
  const { repeated, loops, roots, rooted } = props
  // held: an scc over every declaration is not something to run on each render
  const { compare } = useDisplay()
  const was = useWas("calls")?.calls
  const exports = roots === rooted
  const then = since(
    useMemo(() => was && of(was, exports), [was, exports]),
    compare,
    {
      declarations: declared.length,
      calls: calls.stats.edges,
      resolution: Math.round(calls.stats.coverage * 10_000) / 100,
      dead: dead.length,
      open: only.length,
      busiest: busiest?.callers.length ?? 0,
      loops: loops.length,
      repeated: repeated.length,
    },
  )
  return (
    <>
      <Section id="kpis_execution_general">
        <Kpis>
          <Kpi
            label="Declarations"
            value={num(declared.length)}
            moved={then.declarations}
            says="declarations"
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
            moved={then.calls}
            says="call edges"
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
            moved={then.resolution}
            says="percentage points placed"
            sub={
              calls.stats.unresolved
                ? `${plural(calls.stats.unresolved, "call")} land nowhere we can name`
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
            moved={then.dead}
            says="declarations nothing reaches"
            sub={`${plural(deadLines, "line")} nothing arrives at`}
            verdict={deadOf(deadLines, declaredLines)}
          />
        </Kpis>
      </Section>
      <Section id="kpis_execution_reach">
        <Kpis>
          <Kpi
            label="Only exported"
            value={num(only.length)}
            moved={then.open}
            says="exports nothing here calls"
            sub="handed out, never called in here"
            verdict={{
              label: roots === rooted ? "counted as reached" : "counted as dead",
              tone: "plain",
              why: "an export nothing calls is a public surface or a leftover, and only you know which. The switch above decides how the tables read it",
            }}
          />
          <Kpi
            label="Most called"
            value={busiest ? num(busiest.callers.length) : "0"}
            moved={then.busiest}
            says="callers of the busiest one"
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
            moved={then.loops}
            says="rings"
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
            moved={then.repeated}
            says="names declared in several files"
            sub={`declared in ${plural(new Set(repeated.flatMap((t) => t.files)).size, "file")}`}
            verdict={{
              label: repeated[0] ? `${repeated[0].name} in ${repeated[0].files.length}` : "none",
              tone: "plain",
              why: "one name declared in several files. A convention, or the same code twice: the table says where, you say which",
            }}
          />
        </Kpis>
      </Section>{" "}
    </>
  )
}
