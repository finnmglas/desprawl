// owner: finn
// goal: every group on the level its imports put it on

import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { Section } from "../../atoms/section.tsx"
import { Tip } from "../../atoms/tip.tsx"
import { CopyButton } from "../copy-button.tsx"
import { Save } from "../save.tsx"
import { Some } from "./some.tsx"
import { num, plural } from "../../../lib/say/format.ts"
import { shapeOf } from "../../../lib/say/verdict.ts"
import { cn } from "../../../lib/app/ui.ts"
import type { Unit } from "../../../../src/read/layers.ts"
import type { Shape } from "../../../../src/read/shapes.ts"

const count = (edges: Record<string, number>) => Object.values(edges).reduce((sum, n) => sum + n, 0)
const reach = (unit: Unit) => Object.keys(unit.out).length
const shaped = (shape: Shape) => (shape.sure ? shape.label : `~${shape.label}`)

interface Props {
  units: Unit[]
  /** the group the rest of the page is about, drawn as chosen */
  focus: string
  label?: (path: string) => string
  /** groups left out by the source-only setting */
  dropped: number
  onPick: (path: string) => void
}

export function Levels({ units, focus, label, dropped, onPick }: Props) {
  const levels = Math.max(...units.map((u) => u.level)) + 1
  const choose = onPick
  const stacked = (): [number, Unit[]][] =>
    Array.from({ length: levels }, (_, i) => levels - 1 - i)
      .map((level) => [level, units.filter((u) => u.level === level)] as [number, Unit[]])
      .filter(([, here]) => here.length)

  return (
    <Section id="card_dependency_levels">
      <Card>
        <CardHead title="Dependency levels" hint="L0 imports nothing, L1 at least L0 etc">
          <div className="ml-auto flex items-center gap-1">
            <CopyButton
              label="Copy the levels, as text"
              text={() =>
                stacked()
                  .map(([level, here]) => `L${level}\t${here.map((u) => u.path).join(", ")}`)
                  .join("\n")
              }
              message={`Copied ${plural(levels, "level")}`}
              note="Each level and the groups sitting on it"
            />
            <Save
              name="levels"
              rows={() => [
                ["level", "group", "path", "files", "lines", "classification"],
                ...stacked().flatMap(([level, here]) =>
                  here.map((u) => [
                    level,
                    label?.(u.path) ?? u.path,
                    u.path,
                    u.files,
                    u.lines,
                    shaped(shapeOf(u.internal, count(u.out), count(u.in), reach(u))),
                  ]),
                ),
              ]}
              note={`${plural(units.length, "group")} over ${plural(levels, "level")}, as`}
            />
          </div>
        </CardHead>
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: levels }, (_, i) => levels - 1 - i).map((level) => {
            const here = units.filter((u) => u.level === level)
            if (!here.length) return null
            return (
              <div key={level} className="flex items-start gap-3 border-t pt-2 first:border-0">
                <div className="w-28 shrink-0">
                  <div className="text-xs font-medium">level {level}</div>
                  <div className="text-muted-foreground text-xs">
                    {plural(here.length, "group")}, {num(here.reduce((s, u) => s + u.files, 0))}{" "}
                    files
                  </div>
                </div>
                <Some>
                  {[...here]
                    .sort((a, b) => b.files - a.files)
                    .map((unit) => (
                      <Tip
                        key={unit.path}
                        text={
                          <>
                            <span className="font-mono">{unit.path}</span>
                            <br />
                            {plural(unit.files, "file")}, {num(unit.exports)} exported names
                            <br />
                            leans on {plural(Object.keys(unit.out).length, "group")}, carried by{" "}
                            {plural(Object.keys(unit.in).length, "group")}
                            {unit.tangle >= 0 && <> · in loop</>}
                          </>
                        }
                      >
                        <button
                          onClick={() => choose(unit.path)}
                          className={cn(
                            "hover:border-ring flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                            unit.tangle >= 0 && "border-amber-500/60",
                            unit.path === focus && "border-ring bg-sky-500/15",
                          )}
                        >
                          <span className="max-w-56 truncate">
                            {label?.(unit.path) ?? unit.path}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {num(unit.files)}
                          </span>
                        </button>
                      </Tip>
                    ))}
                </Some>
              </div>
            )
          })}
          {dropped > 0 && (
            <p className="text-muted-foreground border-t pt-2 text-xs">
              {plural(dropped, "group")} left out tests, config, scripts for the source-only
              setting.
            </p>
          )}
        </CardContent>
      </Card>
    </Section>
  )
}
