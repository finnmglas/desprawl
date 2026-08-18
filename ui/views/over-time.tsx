// owner: finn
// goal: the chart, and the controls that shape it

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "../components/atoms/button.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { Save } from "../components/molecules/save.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import {
  CURSOR,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/atoms/chart.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Working, useSlow } from "../components/atoms/working.tsx"
import { untransform } from "../lib/draw/curve.ts"
import { useDisplay } from "../lib/app/display.tsx"
import {
  defaultGrain,
  endsAt,
  grainsFor,
  nearestGrain,
  num,
  stamp,
  startsAt,
} from "../lib/say/format.ts"

import { hourCurve, isLive, sizeCurve, type Sample } from "../lib/app/live.ts"
import { GROUPS, SERIES, expand, rows } from "../lib/draw/series.ts"
import { cn } from "../lib/app/ui.ts"
import type { Grain } from "../lib/say/format.ts"
import type { Hours, Timeline } from "../../src/facts/samples.ts"
import type { Stats } from "../../src/read/model.ts"

export function OverTime({
  stats,
  all,
  onCommits,
  onZoom,
}: {
  stats: Stats
  all: Timeline | null
  onCommits: (from: string, to: string) => void
  /** the window on screen, so another panel can answer for the same days */
  onZoom?: (from: string, to: string) => void
}) {
  const { curve } = useDisplay()
  const total = all?.total ?? stats.commits
  const chart = useRef<HTMLDivElement>(null)
  const [grain, setGrain] = useState<Grain>(() => defaultGrain(stats.first, stats.last))
  const [grained, setGrained] = useState(false)
  const [sizes, setSizes] = useState<Sample[]>([])
  const [sizing, setSizing] = useState(false)
  // the hour window, keyed by the days it covers so the same window is read once
  const [hours, setHours] = useState<{ at: string; got: Hours | null }>({ at: "", got: null })
  const slow = useSlow(sizing)
  // how a repo grew, how often, and who was there while it did
  const [picked, setPicked] = useState<string[]>(["commits", "changes", "lines", "devs"])
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
    () => rows(stats, series, grain, curve, all, sizes, hours.got),
    [stats, picked, grain, curve, all, sizes, hours],
  )

  // kept as an instant, so changing the grain keeps the window
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  useEffect(() => {
    // iso, not the reading format: a german locale would hand over 7.7.2025
    onZoom?.(zoom ? stamp(new Date(zoom[0])) : "", zoom ? stamp(new Date(zoom[1])) : "")
  }, [zoom])
  const [drag, setDrag] = useState<[string, string] | null>(null)

  // zooming in drops the coarse grains, resetting hands them back
  const span = useMemo(() => {
    const first = (all?.first ?? stats.first).slice(0, 10)
    const last = (all?.last ?? stats.last).slice(0, 10)
    const [from, to] = zoom ?? [startsAt(first), endsAt(last, "day")]
    return (to - from) / 86_400_000
  }, [zoom, all, stats.first, stats.last])
  // by the hour needs a live read, so a saved page never offers it
  const offered = useMemo(() => grainsFor(span).filter((g) => g !== "hour" || isLive()), [span])
  // land on the nearest grain this span can carry
  useEffect(() => {
    if (!offered.includes(grain)) setGrain(nearestGrain(grain, offered))
  }, [offered, grain])

  // by the hour is read live, for the window on screen and no wider
  const hourSpan = useMemo(() => {
    const first = (all?.first ?? stats.first).slice(0, 10)
    const last = (all?.last ?? stats.last).slice(0, 10)
    const from = stamp(new Date(zoom ? zoom[0] : startsAt(first)))
    const to = stamp(new Date(zoom ? zoom[1] : endsAt(last, "day")))
    return `${from}:${to}`
  }, [zoom, all, stats.first, stats.last])
  useEffect(() => {
    if (grain !== "hour" || hours.at === hourSpan) return
    const [from, to] = hourSpan.split(":")
    setHours({ at: hourSpan, got: null })
    void hourCurve(from, to).then((got) => setHours({ at: hourSpan, got }))
  }, [grain, hourSpan, hours.at])

  const shown = useMemo(() => {
    if (!zoom) return days
    const [from, to] = zoom
    const inside = days.filter((d) => startsAt(d.day) <= to && endsAt(d.day, grain) >= from)
    return inside.length ? inside : days
  }, [days, zoom, grain])

  const select = {
    onMouseDown: (e: { activeLabel?: string }) =>
      e?.activeLabel && setDrag([e.activeLabel, e.activeLabel]),
    onMouseMove: (e: { activeLabel?: string }) =>
      drag && e?.activeLabel && setDrag([drag[0], e.activeLabel]),
    // a click is not a range
    onMouseUp: () => {
      if (drag && drag[0] !== drag[1]) {
        const [a, b] = [startsAt(drag[0]), startsAt(drag[1])]
        const [first, last] = a <= b ? drag : [drag[1], drag[0]]
        setZoom([startsAt(first), endsAt(last, grain)])
      }
      setDrag(null)
    },
    onMouseLeave: () => setDrag(null),
    onDoubleClick: () => setZoom(null),
  }
  const config = Object.fromEntries(series.map((k) => [k, SERIES[k]]))

  // the same numbers as objects, which is what a paste into anything else wants
  const records = () =>
    JSON.stringify(
      shown.map((row) =>
        Object.fromEntries([
          ["day", row.day],
          ...series.map((k) => [SERIES[k].label, row[`${k}_raw`] ?? row[k] ?? null]),
        ]),
      ),
      null,
      2,
    )

  // the numbers as measured, not as drawn: a log curve or a share is display only
  const matrix = () => [
    ["day", ...series.map((k) => SERIES[k].label)],
    ...shown.map((row) => [
      String(row.day),
      ...series.map((k) => String(row[`${k}_raw`] ?? row[k] ?? "")),
    ]),
  ]
  const share = picked.length > 1
  // a line needs two points, below that a bar is the only honest shape
  const sparse = shown.length < 2

  // whichever fact about this chart matters most right now
  const mixed =
    picked.some((k) => k === "commits" || k === "devs") &&
    picked.some((k) => k !== "commits" && k !== "devs")
  const reading = grain === "hour" && !hours.got
  const hint = reading
    ? "reading every commit in this window by the hour…"
    : !all && stats.truncated
      ? "reading every commit date, so the chart can span the whole history…"
      : zoom
        ? `zoomed to ${shown[0]?.day} - ${shown.at(-1)?.day}, ${num(shown.length)} of ${num(days.length)} buckets. Double click to reset`
        : slow
          ? "measuring the size at points across history…"
          : all && mixed
            ? `commits and devs span all ${num(total)} commits, the rest the latest ${num(stats.commits)}`
            : share
              ? "each drawn against its own peak, so shapes compare. Hover for real numbers"
              : (GROUPS.find((g) => g.key === picked[0])?.about ?? "")

  return (
    <Card>
      <CardHead title="Timeline" hint={hint} wrap>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {zoom && (
            <Button variant="outline" size="sm" onClick={() => setZoom(null)}>
              reset zoom
            </Button>
          )}
          {zoom && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCommits(stamp(new Date(zoom[0])), stamp(new Date(zoom[1])))}
            >
              view commits
            </Button>
          )}
          <Working on={sizing} />
          <Tabs tabs={offered} value={grain} onChange={(next) => setGrain(next as Grain)} />
          <CopyButton
            text={records}
            message={`Copied ${shown.length} buckets`}
            note="As json, one object per bucket"
          />
          <Save
            name="timeline"
            picture={() => chart.current}
            rows={matrix}
            note={`${shown.length} buckets, ${series.length} series, as`}
          />
        </div>
      </CardHead>
      <CardContent>
        <div ref={chart}>
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
              {/* moved lines as bars, a headcount as a bare line, the rest as areas */}
              {series.map((key) =>
                SERIES[key].heads && !sparse ? (
                  <Line
                    key={key}
                    dataKey={key}
                    type="monotone"
                    stroke={SERIES[key].color}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                ) : SERIES[key].group === "changes" || sparse ? (
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
        </div>

        {/* the legend is the control, and it sits under its own chart on the right */}
        <div className="mt-3 flex flex-wrap justify-end gap-1.5">
          {/* the size curve is eighty tree walks on the repo, which a saved page cannot do */}
          {GROUPS.filter((group) => group.key !== "size" || isLive()).map((group) => {
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
