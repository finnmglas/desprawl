// owner: finn
// goal: show data

import { useEffect, useMemo, useState } from "react"
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceArea, XAxis, YAxis } from "recharts"
import { AiCard } from "../components/ai-card.tsx"
import { Avatar } from "../components/avatar.tsx"
import { Button } from "../components/button.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "../components/card.tsx"
import { cn } from "../lib/ui.ts"
import { CURSOR, ChartContainer, ChartTooltip, ChartTooltipContent } from "../components/chart.tsx"
import { untransform } from "../lib/curve.ts"
import { DataTable, type Column } from "../components/data-table.tsx"
import { METRICS } from "../lib/columns.ts"
import { Onward } from "../components/onward.tsx"
import { StackCard } from "../components/stack-card.tsx"
import { Tabs } from "../components/tabs.tsx"
import { useDisplay } from "../lib/display.tsx"
import { GRAINS, day, defaultGrain, num, pct, plural, tokens } from "../lib/format.ts"
import { allTime, sizeCurve, type Sample } from "../lib/live.ts"
import type { Timeline } from "../../src/history.ts"
import { ADDED, GROUPS, REMOVED, SERIES, expand, rows } from "../lib/series.ts"
import type { Grain } from "../lib/format.ts"
import type { Contributor, Node, Stats } from "../../src/model.ts"

const LANGS: Column<Node>[] = [{ key: "name", label: "Language", get: (l) => l.name }, ...METRICS]

// prettier-ignore
const people = (commits: number, moved: number, faces: Record<string, string>): Column<Contributor>[] => [
  {
    key: "name", label: "Name", get: (p) => p.name,
    cell: (p) => (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar name={p.name} email={p.email} found={faces[p.email.toLowerCase()]} />
        <span className="truncate">{p.name}</span>
      </span>
    ),
  },
  { key: "email", label: "Email", get: (p) => p.email },
  { key: "commits", label: "com", num: true, get: (p) => p.commits, cell: (p) => num(p.commits) },
  { key: "pct", label: "pct", num: true, get: (p) => p.commits / (commits || 1), cell: (p) => pct(p.commits, commits) },
  {
    key: "added", label: "added", num: true, get: (p) => p.insertions,
    cell: (p) => <span style={{ color: ADDED }}>+{num(p.insertions)}</span>,
  },
  {
    key: "removed", label: "removed", num: true, get: (p) => p.deletions,
    cell: (p) => <span style={{ color: REMOVED }}>-{num(p.deletions)}</span>,
  },
  { key: "churn", label: "churn", num: true, get: (p) => p.insertions + p.deletions, cell: (p) => pct(p.insertions + p.deletions, moved) },
  { key: "files", label: "files", num: true, get: (p) => p.files, cell: (p) => num(p.files) },
  { key: "first", label: "first", num: true, get: (p) => p.first, cell: (p) => day(p.first), flat: true },
  { key: "last", label: "last", num: true, get: (p) => p.last, cell: (p) => day(p.last), flat: true },
]

export function Overview({
  stats,
  onLang,
  onTab,
  faces,
}: {
  stats: Stats
  onLang: (lang: string) => void
  onTab: (tab: string) => void
  faces: Record<string, string>
}) {
  const { curve } = useDisplay()
  const [grain, setGrain] = useState<Grain>(() => defaultGrain(stats.first, stats.last))
  const [grained, setGrained] = useState(false)
  const [all, setAll] = useState<Timeline | null>(null)
  const [sizes, setSizes] = useState<Sample[]>([])
  const [sizing, setSizing] = useState(false)
  // a second pass, so it lands after paint
  useEffect(() => {
    if (stats.truncated) void allTime().then(setAll)
  }, [stats.truncated])
  const total = all?.total ?? stats.commits
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
  const source = stats.code + stats.comment
  const moved = stats.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const span = Math.round((Date.parse(stats.last) - Date.parse(stats.first)) / 86_400_000) + 1

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* each card opens its tab */}
        {[
          {
            label: "Lines of code",
            value: num(stats.code),
            sub: `${num(stats.files)} files`,
            to: "Files",
          },
          {
            label: "Comments",
            value: num(stats.comment),
            sub: `${pct(stats.comment, source)} of source`,
            to: "Files",
          },
          {
            label: "Tokens",
            value: `~${num(tokens(stats.chars))}`,
            sub: `${num(stats.chars)} chars`,
            to: "Files",
          },
          {
            label: "Commits",
            value: num(total),
            sub: stats.truncated
              ? `${plural(stats.contributors.length, "dev")} in the latest ${num(stats.commits)}`
              : `${plural(stats.contributors.length, "dev")} in ${plural(span, "day")}`,
            to: "History",
          },
        ].map((card) => (
          <Card
            key={card.label}
            onClick={() => onTab(card.to)}
            title={`Open ${card.to}`}
            className="hover:border-ring cursor-pointer transition-colors"
          >
            <CardHeader>
              <CardTitle className="text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-semibold tabular-nums">{card.value}</div>
              <div className="text-muted-foreground text-xs">{card.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.files === 0 && (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nothing countable here. Every tracked file is binary, or has neither a known extension
            nor a name desprawl recognises, so there are no lines to report.
          </CardContent>
        </Card>
      )}

      <StackCard stack={stats.stack} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle>Over time</CardTitle>
            <span className="text-muted-foreground text-xs">
              {!all && stats.truncated
                ? "reading every commit date, so the chart can span the whole history…"
                : zoom
                  ? `zoomed to ${shown[0]?.day} - ${shown.at(-1)?.day}, ${num(shown.length)} of ${num(days.length)} buckets. Double click to reset`
                  : sizing
                    ? "measuring the size at points across history…"
                    : all &&
                        picked.some((k) => k === "commits" || k === "devs") &&
                        picked.some((k) => k !== "commits" && k !== "devs")
                      ? `commits and devs span all ${num(total)} commits, the rest the latest ${num(stats.commits)}`
                      : share
                        ? "each drawn against its own peak, so shapes compare. Hover for real numbers"
                        : (GROUPS.find((g) => g.key === picked[0])?.about ?? "")}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {zoom && (
              <Button variant="outline" size="sm" onClick={() => setZoom(null)}>
                reset zoom
              </Button>
            )}
            <Tabs tabs={GRAINS} value={grain} onChange={(next) => setGrain(next as Grain)} />
          </div>
        </CardHeader>
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

      <DataTable
        title="Languages"
        hint="Click one to see where it lives"
        columns={LANGS}
        rows={stats.languages}
        id={(l) => l.name}
        fold={8}
        onRowClick={(l) => onLang(l.name)}
        total={{ ...stats.tree, name: "total" }}
      />

      <DataTable
        title="Contributors"
        hint={`${stats.contributors.length} identities, merged by mailmap email`}
        columns={people(stats.commits, moved, faces)}
        rows={stats.contributors}
        id={(p) => p.email}
        fold={8}
      />

      <AiCard ai={stats.stack.ai} />

      <Onward stats={stats} current="Overview" onTab={onTab} />
    </div>
  )
}
