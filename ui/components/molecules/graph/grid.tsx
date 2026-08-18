// owner: finn
// goal: who imports whom, as a grid or a ring

import { useRef } from "react"
import { Button } from "../../atoms/button.tsx"
import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { Section } from "../../atoms/section.tsx"
import { Tabs } from "../../atoms/tabs.tsx"
import { Circle } from "./circle.tsx"
import { CopyButton } from "../copy-button.tsx"
import { Matrix } from "./matrix.tsx"
import { Save } from "../save.tsx"
import { plural } from "../../../lib/say/format.ts"
import { useKept } from "../../../lib/app/kept.ts"
import type { Unit } from "../../../../src/read/layers.ts"

// a grid reads as a grid, until it is a ring
const VIEWS = ["matrix", "circle"]

interface Props {
  /** the groups drawn, and every group there is, since a row reaches across all of them */
  shown: Unit[]
  units: Unit[]
  kept: Set<string>
  /** how many dependencies are drawn, for the copy */
  links: number
  rings: Set<string>
  cuts: Set<string>
  focus: string
  label?: (path: string) => string
  order?: (a: Unit, b: Unit) => number
  onPick: (path: string) => void
}

export function Grid({
  shown,
  units,
  kept,
  links,
  rings,
  cuts,
  focus,
  label,
  order,
  onPick,
}: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const [view, setView] = useKept("modules.view", VIEWS[0])
  const [wide, setWide] = useKept("modules.wide", false)
  const crowded = shown.length > 50
  const choose = onPick

  return (
    <Section id="card_dependency_grid">
      <Card>
        <CardHead title="Dependency Grid" hint="Row imports column, module sort applies" wrap>
          <div className="ml-auto flex items-center gap-1">
            <Tabs tabs={VIEWS} value={view} onChange={setView} />
            {crowded && view === VIEWS[0] && (
              <Button variant="outline" size="sm" onClick={() => setWide(!wide)}>
                {wide ? "hide some" : "show all"}
              </Button>
            )}
            <CopyButton
              label="Copy every dependency, as text"
              text={() =>
                shown
                  .flatMap((u) =>
                    Object.entries(u.out)
                      .filter(([to]) => kept.has(to))
                      .map(
                        ([to, n]) =>
                          `${u.path}\t${to}\t${n}\t${rings.has(`${u.path} ${to}`) ? "cycle" : cuts.has(`${u.path} ${to}`) ? "break" : ""}`,
                      ),
                  )
                  .join("\n")
              }
              message={`Copied ${plural(links, "dependency")}`}
              note="From, to, how many files, and whether it is a cycle"
            />
            <Save
              name="dependency-grid"
              picture={() => grid.current}
              rows={() => [
                ["from", "to", "imports", "kind"],
                ...shown.flatMap((u) =>
                  Object.entries(u.out)
                    .filter(([to]) => kept.has(to))
                    .map(([to, n]) => [
                      u.path,
                      to,
                      n,
                      rings.has(`${u.path} ${to}`)
                        ? "cycle"
                        : cuts.has(`${u.path} ${to}`)
                          ? "break"
                          : "import",
                    ]),
                ),
              ]}
              note={`${plural(links, "dependency")}, as`}
            />
          </div>
        </CardHead>
        <CardContent>
          <div ref={grid}>
            {view === VIEWS[0] ? (
              <Matrix
                rings={rings}
                chosen={focus}
                label={label}
                units={shown}
                across={units}
                most={crowded && !wide ? 12 : shown.length}
                order={order}
                cuts={cuts}
                onPick={choose}
              />
            ) : (
              <Circle
                units={shown}
                cuts={cuts}
                rings={rings}
                chosen={focus}
                label={label}
                onPick={choose}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </Section>
  )
}
