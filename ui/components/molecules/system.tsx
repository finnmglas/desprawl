// owner: finn
// goal: the repo as one picture

import { Chip } from "./chip.tsx"
import { Face, Hands } from "./hands.tsx"
import { Tip } from "../atoms/tip.tsx"
import { num, plural } from "../../lib/format.ts"
import { useDisplay } from "../../lib/display.tsx"
import { MEANS, isClient, isHost } from "../../lib/outside.ts"
import { hands, handsOf } from "../../lib/people.ts"
import { shapeOf } from "../../lib/verdict.ts"
import { cn } from "../../lib/ui.ts"
import type { Unit } from "../../../src/layers.ts"
import type { Move } from "../../../src/history.ts"
import type { Contributor, Stack } from "../../../src/model.ts"

// says nothing alone
const PLAIN = new Set([
  "lib",
  "libs",
  "utils",
  "util",
  "helpers",
  "common",
  "core",
  "shared",
  "src",
  "app",
  "components",
  "hooks",
  "types",
  "api",
  "ui",
  "config",
  "internal",
  "modules",
  "packages",
])

// same width each: six go 3+3, not 4+2
const columns = (count: number, widest: number): number => {
  let best = 1
  let score = Infinity
  for (let wide = Math.min(widest, count); wide >= 1; wide--) {
    const holes = (wide - (count % wide)) % wide
    const cost = holes + Math.ceil(count / wide)
    if (cost < score) [score, best] = [cost, wide]
  }
  return best
}

const said = (part: string) =>
  part
    .replace(/^[([]|[)\]]$/g, "")
    .replace(/[-_.]+/g, " ")
    .trim()

/** convex/lib reads as Convex lib, convex/* as Convex modules */
function title(path: string): string {
  const parts = path.split("/")
  const rest = parts.at(-1) === "*"
  const own = said((rest ? parts.at(-2) : parts.at(-1)) ?? path)
  const above = said(parts.at(rest ? -3 : -2) ?? "")
  const whole = PLAIN.has(own.toLowerCase()) && above ? `${above} ${own}` : own
  const named = whole.charAt(0).toUpperCase() + whole.slice(1)
  return rest ? `${named} modules` : named
}

const BANDS = [
  {
    key: "entry",
    label: "Entrypoints",
    hint: "imports mostly from elsewhere, so it wires the rest together",
  },
  {
    key: "middle",
    label: "Middle collections",
    hint: "neither a module nor a composition layer, which is what makes it hard to move",
  },
  {
    key: "base",
    label: "Stands on its own (Module)",
    hint: "its imports stay inside it, so it could be lifted out as it is",
  },
] as const

export function System({
  name,
  units,
  stack,
  people,
  worked,
  moved,
  faces,
  onPick,
}: {
  /** the repo, since "this repo" says less than its own name does */
  name: string
  units: Unit[]
  stack: Stack
  people: Contributor[]
  /** commits per contributor index, by folder */
  worked: Map<string, Record<number, number>>
  /** what moved inside a chosen window, and who moved it, by group */
  moved?: Map<string, Move>
  faces: Record<string, string>
  onPick?: (path: string) => void
}) {
  const { curve } = useDisplay()
  const peak = Math.max(1, ...units.map((u) => u.lines))
  const weigh = (lines: number) =>
    Math.min(100, (curve === "log" ? Math.log1p(lines) / Math.log1p(peak) : lines / peak) * 100)

  // added up, removed down
  // drawn modules only
  const swing = Math.max(
    1,
    ...units.flatMap((unit) => {
      const one = moved?.get(unit.path)
      return one ? [one.up, one.down] : []
    }),
  )
  const read = (unit: Unit) =>
    shapeOf(
      unit.internal,
      Object.values(unit.out).reduce((sum, n) => sum + n, 0),
    )

  // in a window, whoever did the moving then, rather than whoever owns it overall
  const crew = (unit: Unit) =>
    moved ? handsOf(moved.get(unit.path)?.by, people) : hands(unit.path, worked, people)

  const rows = BANDS.map((band) => ({
    ...band,
    // deepest first
    held: units
      .filter((u) => read(u).band === band.key)
      .sort((a, b) => b.level - a.level || b.lines - a.lines),
  })).filter((row) => row.held.length)

  const named = [...new Set([...stack.hosts, ...stack.apis, ...stack.connects])].map((label) => ({
    label,
    from: stack.from[label],
    talks: units.filter((u) => stack.from[label] && u.installs.includes(stack.from[label])),
  }))
  // runs on one side, calls on the other
  const hosts = named.filter((s) => isHost(s.label))
  const services = named.filter((s) => !isHost(s.label) && !isClient(s.label))
  const clients = named.filter((s) => isClient(s.label))

  const Side = ({ side, of }: { side: "left" | "right"; of: typeof named }) => (
    <div className="hidden shrink-0 flex-col sm:flex sm:w-36 lg:w-60">
      <div className="flex flex-1 flex-col justify-center gap-3">
        {of.map((one) => {
          const means = MEANS[one.label]
          const runs = means?.way ?? "out"
          const way =
            side === "left" ? "left" : runs === "both" ? "both" : runs === "in" ? "left" : "right"
          const reached = one.talks.map((u) => u.path)
          return (
            <div
              key={one.label}
              className={cn("flex items-center", side === "left" && "flex-row-reverse")}
            >
              {/* head where the traffic arrives */}
              <span className="hidden shrink-0 items-center lg:flex">
                {(way === "left" || way === "both") && (
                  <span className="border-muted-foreground/70 size-0 border-y-4 border-y-transparent border-r-4 border-l-0" />
                )}
                <span
                  className={cn("h-px w-6", one.talks.length ? "bg-foreground/40" : "bg-border")}
                />
                {(way === "right" || way === "both") && (
                  <span className="border-muted-foreground/70 size-0 border-y-4 border-y-transparent border-l-4 border-r-0" />
                )}
              </span>
              {/* the chip has its own hint */}
              <div className="bg-card flex min-w-0 flex-1 flex-col gap-1 rounded-lg border p-2">
                <Chip label={one.label} from={one.from} />
                <Tip
                  className="min-w-0"
                  text={
                    reached.length
                      ? `reached from ${reached.slice(0, 3).join(", ")}${reached.length > 3 ? ` and ${reached.length - 3} more` : ""}`
                      : "named by the config or a manifest, not by any import"
                  }
                >
                  <span className="text-muted-foreground block truncate text-[10px]">
                    {means?.what ?? "outside this repo"} ·{" "}
                    {one.talks.length ? `${num(one.talks.length)} modules` : "config only"}
                  </span>
                </Tip>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="flex items-stretch gap-2 sm:gap-0">
      {hosts.length > 0 && <Side side="left" of={hosts} />}

      {/* the wall: everything inside it is code this repo holds */}
      <div
        className={cn(
          "border-foreground/40 flex min-w-0 flex-1 flex-col rounded-xl border-2",
          // nothing beside it, so it keeps the middle
          !hosts.length && !services.length && "lg:mx-auto lg:max-w-3xl",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
          <span className="text-sm font-medium">{name}</span>
          {stack.frameworks.slice(0, 4).map((name) => (
            <Chip key={name} label={name} from={stack.from[name]} />
          ))}
          {clients.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">speaks</span>
              {clients.slice(0, 3).map((one) => (
                <Chip key={one.label} label={one.label} from={one.from} />
              ))}
            </span>
          )}
        </div>

        {rows.map((row, i) => (
          <div
            key={row.key}
            className={cn(
              "flex flex-col gap-2 px-3 py-3",
              i && "border-t",
              i === rows.length - 1 && "rounded-b-[10px]",
              // the base is the foundation
              row.key === "base" && "bg-muted/30",
              row.key === "middle" && "bg-muted/10",
            )}
          >
            <Tip text={row.hint} className="w-fit">
              <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
                {row.label}
              </span>
            </Tip>
            <div
              // one count per width, since a phone fits two of these and a laptop four
              className="grid grid-cols-[repeat(var(--tight),minmax(0,1fr))] gap-1.5 sm:grid-cols-[repeat(var(--some),minmax(0,1fr))] lg:grid-cols-[repeat(var(--wide),minmax(0,1fr))]"
              style={
                {
                  "--tight": columns(row.held.length, 2),
                  "--some": columns(row.held.length, 3),
                  "--wide": columns(row.held.length, 4),
                } as React.CSSProperties
              }
            >
              {row.held.map((unit) => {
                const shape = read(unit)
                return (
                  // the wrapper is the grid cell, so it is the one that has to fill it
                  <Tip
                    key={unit.path}
                    className="min-w-0"
                    text={
                      <>
                        <span className="font-mono">{unit.path}</span>
                        <br />
                        {shape.label} · {plural(unit.files, "file")} · {num(unit.lines)} lines ·{" "}
                        {plural(unit.packages, "package")}
                        {unit.tangle >= 0 && <> · in a loop</>}
                        <Hands of={crew(unit)} faces={faces} />
                      </>
                    }
                  >
                    <button
                      onClick={() => onPick?.(unit.path)}
                      style={
                        moved
                          ? undefined
                          : {
                              backgroundImage: `linear-gradient(to top, color-mix(in oklch, var(--chart-2) 20%, transparent) ${weigh(unit.lines)}%, transparent ${weigh(unit.lines)}%)`,
                            }
                      }
                      className={cn(
                        // the card tone on dark, where the page background reads as a hole
                        "bg-background hover:border-ring dark:bg-card relative flex w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-md border px-2.5 py-1.5 text-left transition-colors",
                        unit.tangle >= 0 && "border-amber-500/60",
                      )}
                    >
                      {moved && (
                        <>
                          <span
                            aria-hidden
                            style={{
                              height: `${Math.min(50, ((moved.get(unit.path)?.up ?? 0) / swing) * 50)}%`,
                            }}
                            className="pointer-events-none absolute inset-x-0 bottom-1/2 bg-emerald-500/25"
                          />
                          <span
                            aria-hidden
                            style={{
                              height: `${Math.min(50, ((moved.get(unit.path)?.down ?? 0) / swing) * 50)}%`,
                            }}
                            className="pointer-events-none absolute inset-x-0 top-1/2 bg-red-500/25"
                          />
                        </>
                      )}
                      <span className="relative flex items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {title(unit.path)}
                        </span>
                        <Face of={crew(unit)} faces={faces} />
                      </span>
                      <span className="text-muted-foreground relative truncate font-mono text-[10px]">
                        {unit.path}
                      </span>
                      <span className="text-muted-foreground relative text-[10px] tabular-nums">
                        {num(unit.files)} files · {num(unit.lines)} lines
                      </span>
                    </button>
                  </Tip>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {services.length > 0 && <Side side="right" of={services} />}
    </div>
  )
}
