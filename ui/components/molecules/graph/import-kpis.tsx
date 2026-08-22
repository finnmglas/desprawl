// owner: finn
// goal: what the import graph itself came to

import { Kpi, Kpis } from "../panels/kpi.tsx"
import { Section } from "../../atoms/section.tsx"
import { num, plural } from "../../../lib/say/format.ts"
import { since } from "../../../lib/say/trend.ts"
import { useDisplay } from "../../../lib/app/display.tsx"
import { useWas } from "../../../lib/app/was.tsx"
import type { Graph } from "../../../../src/read/graph.ts"

export function ImportKpis({ graph }: { graph: Graph }) {
  // the graph as it stood, counted by the same lines: one reading, two dates
  const { compare } = useDisplay()
  const was = useWas("graph")?.graph
  const of = (one: Graph) => ({
    modules: one.stats.files,
    edges: one.stats.edges,
    per: Math.round((one.stats.edges / Math.max(1, one.stats.files)) * 10) / 10,
    // resolution, not what failed: green means up, and up on breakage reads as praise
    resolution: Math.round(one.stats.coverage * 10_000) / 100,
  })
  const then = since(was && of(was), compare, of(graph))
  return (
    <Section id="kpis_modules_imports">
      <Kpis>
        <Kpi
          label="Importing files"
          value={num(graph.stats.files)}
          moved={then.modules}
          says="files in the graph"
          sub={`reaching ${plural(Object.keys(graph.packages).length, "installed package")}`}
          verdict={{
            label: "in graph",
            tone: "plain",
            why: "every ts, js file git tracks",
          }}
        />
        <Kpi
          label="Imports"
          value={num(graph.stats.edges)}
          moved={then.edges}
          says="imports between files"
          sub={`${num(graph.stats.external)} more into packages`}
          verdict={{
            label: "file to file",
            tone: "plain",
            why: "imports resolve to other files in repo.",
          }}
        />
        <Kpi
          label="Imports/file"
          value={(graph.stats.edges / Math.max(1, graph.stats.files)).toFixed(1)}
          moved={then.per}
          says="imports per file"
          sub="imports per average file"
          verdict={{
            label: "average",
            tone: "plain",
            why: "High means little standalone, low that repo is loosely tied",
          }}
        />
        <Kpi
          label="Resolution"
          value={`${(graph.stats.coverage * 100).toFixed(graph.stats.coverage === 1 ? 0 : 2)}%`}
          moved={then.resolution}
          says="percentage points resolved"
          sub={
            graph.missing.length
              ? `${plural(graph.missing.length, "import")} are unresolved`
              : "every imported file found"
          }
          verdict={
            graph.missing.length
              ? {
                  label: "partial",
                  tone: "watch",
                  why: "some faulty or non-resolvable imports",
                }
              : {
                  label: "complete",
                  tone: "fine",
                  why: "every file + package found",
                }
          }
        />
      </Kpis>
    </Section>
  )
}
