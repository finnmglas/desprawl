// owner: finn
// goal: show data

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "../components/card.tsx"
import {
  CURSOR,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  chartColor,
} from "../components/chart.tsx"
import { TBody, TD, TH, THead, TR, Table } from "../components/table.tsx"
import { churn, day, nest, num, pct, tokens } from "../lib/format.ts"
import type { Stats } from "../../src/model.ts"

const CONFIG = { commits: { label: "Commits" } }

export function Overview({ stats, onLang }: { stats: Stats; onLang: (lang: string) => void }) {
  const commits = stats.series.find((s) => s.metric === "commits")
  const days = commits?.data.map((v, i) => ({
    day: new Date(Date.parse(commits.start) + i * 86_400_000).toISOString().slice(0, 10),
    commits: v,
  }))
  const sparse = (days?.length ?? 0) <= 14
  const source = stats.code + stats.comment
  const moved = stats.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Lines of code", num(stats.code), `${num(stats.files)} files`],
          ["Comments", num(stats.comment), `${pct(stats.comment, source)} of source`],
          ["Tokens", `~${num(tokens(stats.chars))}`, `${num(stats.chars)} chars`],
          ["Commits", num(stats.commits), `${stats.contributors.length} contributors`],
        ].map(([label, value, sub]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <div className="text-muted-foreground text-xs">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commits over time</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={CONFIG}>
            {/* a line through two points says nothing, bars do */}
            {sparse ? (
              <BarChart data={days}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={16} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent config={CONFIG} />} />
                <Bar dataKey="commits" fill={chartColor(CONFIG, "commits")} radius={2} />
              </BarChart>
            ) : (
              <AreaChart data={days}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={48} />
                <ChartTooltip cursor={CURSOR} content={<ChartTooltipContent config={CONFIG} />} />
                <Area
                  dataKey="commits"
                  type="monotone"
                  stroke={chartColor(CONFIG, "commits")}
                  fill={chartColor(CONFIG, "commits")}
                  fillOpacity={0.15}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            )}
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Languages</CardTitle>
          <span className="text-muted-foreground text-xs">Click one to explore where it lives</span>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          <Table>
            <THead>
              <TR>
                <TH>Language</TH>
                <TH num>loc</TH>
                <TH num>pct</TH>
                <TH num>comment</TH>
                <TH num>blank</TH>
                <TH num>files</TH>
                <TH num>chars</TH>
                <TH num>~tok</TH>
                <TH num>nest</TH>
                <TH num>com</TH>
                <TH num>churn</TH>
                <TH num>last</TH>
              </TR>
            </THead>
            <TBody>
              {stats.languages.map((lang) => (
                <TR key={lang.name} className="cursor-pointer" onClick={() => onLang(lang.name)}>
                  <TD className="font-medium">{lang.name}</TD>
                  <TD num>{num(lang.code)}</TD>
                  <TD num>{pct(lang.code, stats.code)}</TD>
                  <TD num>{num(lang.comment)}</TD>
                  <TD num>{num(lang.blank)}</TD>
                  <TD num>{num(lang.files)}</TD>
                  <TD num>{num(lang.chars)}</TD>
                  <TD num>{num(tokens(lang.chars))}</TD>
                  <TD num>{nest(lang)}</TD>
                  <TD num>{num(lang.commits)}</TD>
                  <TD num>{num(churn(lang))}</TD>
                  <TD num className="text-muted-foreground">
                    {day(lang.last)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contributors</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH num>commits</TH>
                <TH num>pct</TH>
                <TH num>added</TH>
                <TH num>removed</TH>
                <TH num>churn</TH>
                <TH num>files</TH>
                <TH num>first</TH>
                <TH num>last</TH>
              </TR>
            </THead>
            <TBody>
              {stats.contributors.map((person) => (
                <TR key={person.email}>
                  <TD className="font-medium">{person.name}</TD>
                  <TD className="text-muted-foreground max-w-56 truncate text-xs">
                    {person.email}
                  </TD>
                  <TD num>{num(person.commits)}</TD>
                  <TD num>{pct(person.commits, stats.commits)}</TD>
                  <TD num className="text-chart-2">
                    +{num(person.insertions)}
                  </TD>
                  <TD num className="text-destructive">
                    -{num(person.deletions)}
                  </TD>
                  <TD num>{pct(person.insertions + person.deletions, moved)}</TD>
                  <TD num>{num(person.files)}</TD>
                  <TD num className="text-muted-foreground">
                    {day(person.first)}
                  </TD>
                  <TD num className="text-muted-foreground">
                    {day(person.last)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
