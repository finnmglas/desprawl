// owner: finn
// goal: what the import graph itself came to

import { Kpi, Kpis } from "../panels/kpi.tsx"
import { Section } from "../../atoms/section.tsx"
import { num, plural } from "../../../lib/say/format.ts"
import type { Graph } from "../../../../src/read/graph.ts"

export function ImportKpis({ graph }: { graph: Graph }) {
  return (
    <Section id="kpis_modules_imports">
      <Kpis>
        <Kpi
          label="Importing files"
          value={num(graph.stats.files)}
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
