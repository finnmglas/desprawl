// owner: finn
// goal: the architecture wall, one per repo in a fleet

import { useRef } from "react"
import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { Section } from "../../atoms/section.tsx"
import { Waiting } from "../../atoms/waiting.tsx"
import { Working } from "../../atoms/working.tsx"
import { CopyButton } from "../copy-button.tsx"
import { Save } from "../save.tsx"
import { StackCard } from "../panels/stack-card.tsx"
import { System } from "./system.tsx"
import { group, holds, useGoing } from "../../../lib/app/going.tsx"
import { isLive } from "../../../lib/app/live.ts"
import { plural } from "../../../lib/text/format.ts"
import { shapeOf } from "../../../lib/text/verdict.ts"
import { wall } from "../../../../src/facts/system.ts"
import type { Graph } from "../../../../src/read/graph.ts"
import type { Move } from "../../../../src/facts/history.ts"
import type { Stats } from "../../../../src/read/model.ts"
import type { Unit } from "../../../../src/read/layers.ts"

interface Props {
  name: string
  stats: Stats
  graph: Graph | null
  units: Unit[]
  repos: string[]
  faces: Record<string, string>
  worked: Map<string, Record<string, number>>
  /** what moved in the chosen time frame, when there is a server to ask */
  changed: Map<string, Move>
  ranged: boolean
  asking: boolean
  metadata: boolean
  onMetadata: (open: boolean) => void
}

const count = (edges: Record<string, number>) => Object.values(edges).reduce((sum, n) => sum + n, 0)

export function Architecture(props: Props) {
  const { name, stats, graph, units, repos, faces, asking, metadata, onMetadata } = props
  const { at, open } = useGoing()
  const wall_ = useRef<HTMLDivElement>(null)
  const where = props.worked
  const range = props.ranged
  const changed = props.changed

  return (
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
                    shapeOf(u.internal, count(u.out), count(u.in), Object.keys(u.out).length).label,
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
            {graph && repos.length > 0 ? (
              // one wall per repo, side by side: a fleet has no single architecture
              <div className="grid gap-4 lg:grid-cols-2">
                {/* a repo with nothing to draw is a card of empty bands */}
                {repos
                  .map((one) => ({
                    one,
                    mine: units.filter((u) => u.path === one || u.path.startsWith(`${one}/`)),
                  }))
                  .filter(({ mine }) => mine.length > 0)
                  .map(({ one, mine }) => (
                    <System
                      key={one}
                      name={one}
                      people={stats.contributors}
                      worked={where}
                      faces={faces}
                      units={mine}
                      repos={repos}
                      chosen={holds(
                        at.pick,
                        units.map((u) => u.path),
                      )}
                      onPick={(path, about) => open({ ...group(path), detail: about })}
                    />
                  ))}
              </div>
            ) : graph ? (
              <System
                name={name}
                moved={range && isLive() ? changed : undefined}
                people={stats.contributors}
                worked={where}
                faces={faces}
                units={units}
                stack={stats.stack}
                chosen={holds(
                  at.pick,
                  units.map((u) => u.path),
                )}
                onPick={(path, about) => open({ ...group(path), detail: about })}
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
  )
}
