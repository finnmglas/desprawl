// owner: finn
// goal: the repo as one picture: what composes, what sprawls, what it stands on

import { Chip } from "./chip.tsx"
import { Tip } from "./tip.tsx"
import { num, plural } from "../lib/format.ts"
import { useDisplay } from "../lib/display.tsx"
import { MEANS, isClient, isHost } from "../lib/outside.ts"
import { shapeOf } from "../lib/verdict.ts"
import { cn } from "../lib/ui.ts"
import type { Unit } from "../../src/layers.ts"
import type { Stack } from "../../src/model.ts"

// on its own each of these names nothing, so it takes the folder above with it
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

// every card the same width, so the count that leaves the fewest holes in the fewest
// rows wins: six go three and three rather than four and two
const WIDEST = 4
const columns = (count: number): number => {
  let best = 1
  let score = Infinity
  for (let wide = Math.min(WIDEST, count); wide >= 1; wide--) {
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

/** src/app/(application) reads as Application, convex/lib as Convex lib, convex/* as Convex modules */
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
  onPick,
}: {
  /** the repo, since "this repo" says less than its own name does */
  name: string
  units: Unit[]
  stack: Stack
  onPick?: (path: string) => void
}) {
  const { curve } = useDisplay()
  const peak = Math.max(1, ...units.map((u) => u.lines))
  const weigh = (lines: number) =>
    Math.min(100, (curve === "log" ? Math.log1p(lines) / Math.log1p(peak) : lines / peak) * 100)
  const read = (unit: Unit) =>
    shapeOf(
      unit.internal,
      Object.values(unit.out).reduce((sum, n) => sum + n, 0),
    )

  const rows = BANDS.map((band) => ({
    ...band,
    // deepest first inside a band, so the stack still reads downward without saying so
    held: units
      .filter((u) => read(u).band === band.key)
      .sort((a, b) => b.level - a.level || b.lines - a.lines),
  })).filter((row) => row.held.length)

  const named = [...new Set([...stack.hosts, ...stack.apis, ...stack.connects])].map((label) => ({
    label,
    from: stack.from[label],
    talks: units.filter((u) => stack.from[label] && u.installs.includes(stack.from[label])),
  }))
  // where it runs sits on one side, what it calls on the other, and a client is neither
  const hosts = named.filter((s) => isHost(s.label))
  const services = named.filter((s) => !isHost(s.label) && !isClient(s.label))
  const clients = named.filter((s) => isClient(s.label))

  const Side = ({ side, of }: { side: "left" | "right"; of: typeof named }) => (
    <div className="flex w-full flex-col lg:w-60 lg:shrink-0">
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
              {/* the wire, with its head at the end the traffic arrives at */}
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
              {/* the chip carries its own hint, so only the line under it may carry another */}
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0">
      {hosts.length > 0 && <Side side="left" of={hosts} />}

      {/* the wall: everything inside it is code this repo holds */}
      <div
        className={cn(
          "border-foreground/40 flex min-w-0 flex-1 flex-col rounded-xl border-2",
          // nothing outside it on either side, so it keeps the middle rather than the whole width
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
              // the base is drawn as one, because that is what a foundation looks like
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
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${columns(row.held.length)}, minmax(0, 1fr))`,
              }}
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
                        {shape.label}: {shape.why}
                        <br />
                        {plural(unit.files, "file")}, {num(unit.lines)} lines,{" "}
                        {plural(unit.packages, "package")}
                        {unit.tangle >= 0 && <> · caught in a loop</>}
                      </>
                    }
                  >
                    <button
                      onClick={() => onPick?.(unit.path)}
                      style={{
                        backgroundImage: `linear-gradient(to top, color-mix(in oklch, var(--chart-2) 20%, transparent) ${weigh(unit.lines)}%, transparent ${weigh(unit.lines)}%)`,
                      }}
                      className={cn(
                        // the card tone on dark, where the page background reads as a hole
                        "bg-background hover:border-ring dark:bg-card flex w-full min-w-0 cursor-pointer flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors",
                        unit.tangle >= 0 && "border-amber-500/60",
                      )}
                    >
                      <span className="truncate text-xs font-medium">{title(unit.path)}</span>
                      <span className="text-muted-foreground truncate font-mono text-[10px]">
                        {unit.path}
                      </span>
                      <span className="text-muted-foreground text-[10px] tabular-nums">
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
