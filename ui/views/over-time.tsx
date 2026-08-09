// owner: finn
// goal: the chart, and the controls that shape it

import { useEffect, useMemo, useState } from "react"
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceArea, XAxis, YAxis } from "recharts"
import { Button } from "../components/button.tsx"
import { Card, CardContent } from "../components/card.tsx"
import { CardHead } from "../components/card-head.tsx"
import { CURSOR, ChartContainer, ChartTooltip, ChartTooltipContent } from "../components/chart.tsx"
import { Tabs } from "../components/tabs.tsx"
import { untransform } from "../lib/curve.ts"
import { useDisplay } from "../lib/display.tsx"
import { GRAINS, defaultGrain, num } from "../lib/format.ts"
import { sizeCurve, type Sample } from "../lib/live.ts"
import { GROUPS, SERIES, expand, rows } from "../lib/series.ts"
import { cn } from "../lib/ui.ts"
import type { Grain } from "../lib/format.ts"
import type { Timeline } from "../../src/history.ts"
import type { Stats } from "../../src/model.ts"

export function OverTime({ stats, all }: { stats: Stats; all: Timeline | null }) {
  const { curve } = useDisplay()
  const total = all?.total ?? stats.commits
  const [grain, setGrain] = useState<Grain>(() => defaultGrain(stats.first, stats.last))
  const [grained, setGrained] = useState(false)
  const [sizes, setSizes] = useState<Sample[]>([])
  const [sizing, setSizing] = useState(false)
  // the pair that shows how a repo grew
  const [picked, setPicked] = useState<string[]>(["changes", "lines"])
  const series = expand(picked)
  // the old default is too fine once the span is known
  useEffect(() => {
    if (all && !grained) {
      setGrain(defaultGrain(all.first, all.last))
      setGrained(true)
    }
  }, [all, grained])

  // eighty tree walks, so only once the size series is actually asked for
  useEffect(() => {
    if (!picked.includes("size") || sizes.length || sizing) return
    setSizing(true)
    void sizeCurve().then((found) => {
      setSizes(found)
      setSizing(false)
    })
  }, [picked])

  const days = useMemo(
    () => rows(stats, series, grain, curve, all, sizes),
    [stats, picked, grain, curve, all, sizes],
  )

  // dragging across the chart zooms the chart, every other view stays where it was
  const [zoom, setZoom] = useState<[string, string] | null>(null)
  const [drag, setDrag] = useState<[string, string] | null>(null)
  // a bucket label only means something within one granularity
  useEffect(() => setZoom(null), [grain, all])

  const shown = useMemo(() => {
    if (!zoom) return days
    const [from, to] = zoom.map((label) => days.findIndex((d) => d.day === label))
    if (from < 0 || to < 0) return days
    return days.slice(Math.min(from, to), Math.max(from, to) + 1)
  }, [days, zoom])

  const select = {
    onMouseDown: (e: { activeLabel?: string }) =>
      e?.activeLabel && setDrag([e.activeLabel, e.activeLabel]),
    onMouseMove: (e: { activeLabel?: string }) =>
      drag && e?.activeLabel && setDrag([drag[0], e.activeLabel]),
    // a click is not a range
    onMouseUp: () => {
      if (drag && drag[0] !== drag[1]) setZoom(drag)
      setDrag(null)
    },
    onMouseLeave: () => setDrag(null),
    onDoubleClick: () => setZoom(null),
  }
  const config = Object.fromEntries(series.map((k) => [k, SERIES[k]]))
  const share = picked.length > 1
  // a line needs two points, below that a bar is the only honest shape
  const sparse = shown.length < 2

  // whichever fact about this chart matters most right now
  const mixed =
    picked.some((k) => k === "commits" || k === "devs") &&
    picked.some((k) => k !== "commits" && k !== "devs")
  const hint =
    !all && stats.truncated
      ? "reading every commit date, so the chart can span the whole history…"
      : zoom
        ? `zoomed to ${shown[0]?.day} - ${shown.at(-1)?.day}, ${num(shown.length)} of ${num(days.length)} buckets. Double click to reset`
        : sizing
          ? "measuring the size at points across history…"
          : all && mixed
            ? `commits and devs span all ${num(total)} commits, the rest the latest ${num(stats.commits)}`
            : share
              ? "each drawn against its own peak, so shapes compare. Hover for real numbers"
              : (GROUPS.find((g) => g.key === picked[0])?.about ?? "")

  return (
    <Card>
      <CardHead title="Over time" hint={hint} wrap>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {zoom && (
            <Button variant="outline" size="sm" onClick={() => setZoom(null)}>
              reset zoom
            </Button>
          )}
          <Tabs tabs={GRAINS} value={grain} onChange={(next) => setGrain(next as Grain)} />
        </div>
      </CardHead>
      <CardContent>
        <ChartContainer config={config} className="select-none">
          <ComposedChart data={shown} stackOffset="sign" {...select}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) =>
                share ? `${Math.abs(v)}%` : num(untransform(Math.abs(v), curve))
              }
            />
            <ChartTooltip
              cursor={CURSOR}
              content={<ChartTooltipContent config={config} curve={curve} />}
            />
            {/* moved lines as bars, the rest as areas */}
            {series.map((key) =>
              SERIES[key].group === "changes" || sparse ? (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={SERIES[key].color}
                  radius={2}
                  isAnimationActive={false}
                />
              ) : (
                <Area
                  key={key}
                  dataKey={key}
                  type="monotone"
                  stroke={SERIES[key].color}
                  fill={SERIES[key].color}
                  fillOpacity={0.12}
                  strokeWidth={2}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ),
            )}
            {drag && (
              <ReferenceArea
                x1={drag[0]}
                x2={drag[1]}
                fill="var(--foreground)"
                fillOpacity={0.06}
                strokeOpacity={0.2}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ChartContainer>

        {/* the legend is the control */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {GROUPS.map((group) => {
            const on = picked.includes(group.key)
            return (
              <button
                key={group.key}
                title={group.about}
                onClick={() =>
                  setPicked((prev) =>
                    prev.includes(group.key)
                      ? prev.length > 1
                        ? prev.filter((k) => k !== group.key)
                        : prev
                      : [...prev, group.key],
                  )
                }
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                  on ? "bg-muted" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {group.series.map((key) => (
                  <span
                    key={key}
                    className="size-2 rounded-[2px]"
                    style={{ background: on ? SERIES[key].color : "var(--muted-foreground)" }}
                  />
                ))}
                {group.label}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
