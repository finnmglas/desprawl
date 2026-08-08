// owner: finn
// goal: recharts wearing our tokens
// inspo: shadcn ui/charts

import * as React from "react"
import { ResponsiveContainer, Tooltip } from "recharts"
import { num } from "../lib/format.ts"
import type { Curve } from "../lib/display.tsx"
import { cn } from "../lib/ui.ts"

// key to label and colour, defaults to --chart-1..5 by order
export type ChartConfig = Record<string, { label: string; color?: string }>

// log1p keeps zero at zero, a log axis would drop it
export const transform = (value: number, curve: Curve): number =>
  curve === "log" ? Math.log1p(value) : value

export const untransform = (value: number, curve: Curve): number =>
  curve === "log" ? Math.round(Math.expm1(value)) : value

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export const chartColor = (config: ChartConfig, key: string): string =>
  config[key]?.color ?? PALETTE[Object.keys(config).indexOf(key) % PALETTE.length]

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig
  className?: string
  children: React.ReactElement
}) {
  return (
    <div
      className={cn(
        "h-56 w-full [&_.recharts-cartesian-grid_line]:stroke-border/60 [&_text]:fill-muted-foreground [&_text]:text-[11px]",
        className,
      )}
      data-chart-keys={Object.keys(config).join(",")}
    >
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  )
}

// recharts matches children by type, this must be its own
export const ChartTooltip = Tooltip

export const CURSOR = { stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }

// recharts injects these
export function ChartTooltipContent({
  config,
  active,
  payload,
  label,
  curve = "linear",
}: {
  config: ChartConfig
  active?: boolean
  payload?: any[]
  label?: React.ReactNode
  curve?: Curve
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card text-card-foreground min-w-36 rounded-md border px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2 tabular-nums">
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: chartColor(config, item.dataKey) }}
          />
          <span className="text-muted-foreground">
            {config[item.dataKey]?.label ?? item.dataKey}
          </span>
          <span className="ml-auto font-medium">
            {num(item.payload?.[`${item.dataKey}_raw`] ?? untransform(item.value, curve))}
          </span>
        </div>
      ))}
    </div>
  )
}
