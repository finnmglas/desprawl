// owner: finn
// goal: show data

import { useMemo, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "../components/card.tsx"
import {
  CURSOR,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  chartColor,
  transform,
  untransform,
} from "../components/chart.tsx"
import { DataTable, type Column } from "../components/data-table.tsx"
import { Onward } from "../components/onward.tsx"
import { Tabs } from "../components/tabs.tsx"
import { useDisplay } from "../lib/display.tsx"
import { GRAINS, bucket, churn, day, nest, num, pct, plural, tokens } from "../lib/format.ts"
import type { Grain } from "../lib/format.ts"
import type { Contributor, Node, Stats } from "../../src/model.ts"

// a row's own lines, the denominator when reading shares within a row
const lines = (n: Node) => n.code + n.comment + n.blank

const CONFIG = { plot: { label: "Commits" } }

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
const people = (commits: number, moved: number): Column<Contributor>[] => [
  { key: "name", label: "Name", get: (p) => p.name },
  { key: "email", label: "Email", get: (p) => p.email },
  { key: "commits", label: "com", num: true, get: (p) => p.commits, cell: (p) => num(p.commits) },
  { key: "pct", label: "pct", num: true, get: (p) => p.commits / (commits || 1), cell: (p) => pct(p.commits, commits) },
  {
    key: "added", label: "added", num: true, get: (p) => p.insertions,
    cell: (p) => <span className="text-chart-2">+{num(p.insertions)}</span>,
  },
  {
    key: "removed", label: "removed", num: true, get: (p) => p.deletions,
    cell: (p) => <span className="text-destructive">-{num(p.deletions)}</span>,
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
}: {
  stats: Stats
  onLang: (lang: string) => void
  onTab: (tab: string) => void
}) {
  const { curve } = useDisplay()
  const [grain, setGrain] = useState<Grain>("day")
  const commits = stats.series.find((s) => s.metric === "commits")
  // bucket first, then transform, so log applies to the shown total
  const days = useMemo(
    () =>
      commits
        ? bucket(commits.data, commits.start, grain).map(([day, v]) => ({
            day,
            plot: transform(v, curve),
          }))
        : [],
    [commits, grain, curve],
  )
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
          <CardTitle>Commits over time</CardTitle>
          <Tabs
            className="ml-auto"
            tabs={GRAINS}
            value={grain}
            onChange={(next) => setGrain(next as Grain)}
          />
        </CardHeader>
        <CardContent>
          <ChartContainer config={CONFIG}>
            {/* a line through two points says nothing, bars do */}
            {sparse ? (
              <BarChart data={days}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v: number) => String(untransform(v, curve))}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent config={CONFIG} curve={curve} />}
                />
                <Bar dataKey="plot" fill={chartColor(CONFIG, "plot")} radius={2} />
              </BarChart>
            ) : (
              <AreaChart data={days}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={48} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v: number) => String(untransform(v, curve))}
                />
                <ChartTooltip
                  cursor={CURSOR}
                  content={<ChartTooltipContent config={CONFIG} curve={curve} />}
                />
                <Area
                  dataKey="plot"
                  type="monotone"
                  stroke={chartColor(CONFIG, "plot")}
                  fill={chartColor(CONFIG, "plot")}
                  fillOpacity={0.15}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            )}
          </ChartContainer>
        </CardContent>
      </Card>

      <DataTable
        title="Languages"
        hint="Click one to see where it lives"
        columns={LANGS}
        rows={stats.languages}
        id={(l) => l.name}
        onRowClick={(l) => onLang(l.name)}
        total={{ ...stats.tree, name: "total" }}
      />

      <DataTable
        title="Contributors"
        hint={`${stats.contributors.length} identities, merged by mailmap email`}
        columns={people(stats.commits, moved)}
        rows={stats.contributors}
        id={(p) => p.email}
      />

      <Onward stats={stats} current="Overview" onTab={onTab} />
    </div>
  )
}
