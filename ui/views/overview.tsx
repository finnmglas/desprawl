// owner: finn
// goal: show data

import { useMemo, useState } from "react"
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts"
import { Avatar } from "../components/avatar.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "../components/card.tsx"
import { cn } from "../lib/ui.ts"
import {
  CURSOR,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  untransform,
} from "../components/chart.tsx"
import { DataTable, type Column } from "../components/data-table.tsx"
import { Onward } from "../components/onward.tsx"
import { Tabs } from "../components/tabs.tsx"
import { useDisplay } from "../lib/display.tsx"
import { GRAINS, churn, day, defaultGrain, nest, num, pct, plural, tokens } from "../lib/format.ts"
import { ADDED, GROUPS, REMOVED, SERIES, expand, rows } from "../lib/series.ts"
import type { Grain } from "../lib/format.ts"
import type { Contributor, Node, Stats } from "../../src/model.ts"

// a row's own lines, the denominator when reading shares within a row
const lines = (n: Node) => n.code + n.comment + n.blank

// prettier-ignore
const LANGS: Column<Node>[] = [
  { key: "name", label: "Language", get: (l) => l.name },
  { key: "code", label: "loc", num: true, get: (l) => l.code, cell: (l) => num(l.code), ofRow: lines },
  { key: "comment", label: "comment", num: true, get: (l) => l.comment, cell: (l) => num(l.comment), ofRow: lines },
  { key: "blank", label: "blank", num: true, get: (l) => l.blank, cell: (l) => num(l.blank), ofRow: lines },
  { key: "files", label: "files", num: true, get: (l) => l.files, cell: (l) => num(l.files) },
  { key: "chars", label: "chars", num: true, get: (l) => l.chars, cell: (l) => num(l.chars) },
  { key: "tok", label: "~tok", num: true, get: (l) => tokens(l.chars), cell: (l) => num(tokens(l.chars)) },
  { key: "nest", label: "nest", num: true, get: (l) => Number(nest(l)) },
  { key: "commits", label: "com", num: true, get: (l) => l.commits, cell: (l) => num(l.commits) },
  { key: "churn", label: "churn", num: true, get: (l) => churn(l), cell: (l) => num(churn(l)) },
  { key: "last", label: "last", num: true, get: (l) => l.last, cell: (l) => day(l.last), flat: true },
]

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
  // changes over net lines is the pair that shows how a repo actually grew
  const [picked, setPicked] = useState<string[]>(["changes", "lines"])
  const series = expand(picked)
  const days = useMemo(() => rows(stats, series, grain, curve), [stats, picked, grain, curve])
  const config = Object.fromEntries(series.map((k) => [k, SERIES[k]]))
  const share = picked.length > 1
  const sparse = days.length <= 14
  const source = stats.code + stats.comment
  const moved = stats.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const span = Math.round((Date.parse(stats.last) - Date.parse(stats.first)) / 86_400_000) + 1

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* each card opens the tab that breaks it down */}
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
            value: num(stats.commits),
            sub: `${plural(stats.contributors.length, "dev")} in ${plural(span, "day")}`,
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

      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle>Over time</CardTitle>
            <span className="text-muted-foreground text-xs">
              {share
                ? "each drawn against its own peak, so shapes compare. Hover for real numbers"
                : (GROUPS.find((g) => g.key === picked[0])?.about ?? "")}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Tabs tabs={GRAINS} value={grain} onChange={(next) => setGrain(next as Grain)} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config}>
            <ComposedChart data={days} stackOffset="sign">
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
              {/* moved lines are bars, everything else a line, so an overlay stays readable */}
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
            </ComposedChart>
          </ChartContainer>

          {/* the legend is the control, overlaying two series is where patterns show */}
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

      <Onward stats={stats} current="Overview" onTab={onTab} />
    </div>
  )
}
