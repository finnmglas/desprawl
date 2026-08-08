// owner: finn
// goal: show data

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { Badge } from "../components/badge.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "../components/card.tsx"
import {
  CURSOR,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  chartColor,
} from "../components/chart.tsx"
import { TBody, TD, TH, THead, TR, Table } from "../components/table.tsx"
import type { Stats } from "../../src/model.ts"

const num = (n: number) => n.toLocaleString("en-US")
const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%")

const CONFIG = { commits: { label: "Commits" } }

export function Overview({ stats }: { stats: Stats }) {
  const commits = stats.series.find((s) => s.metric === "commits")
  const days = commits?.data.map((v, i) => ({
    day: new Date(Date.parse(commits.start) + i * 86_400_000).toISOString().slice(0, 10),
    commits: v,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Lines of code", num(stats.code)],
          ["Comments", `${num(stats.comment)} · ${pct(stats.comment, stats.code + stats.comment)}`],
          ["Tokens", `~${num(Math.round(stats.chars / 4))}`],
          ["Commits", `${num(stats.commits)} · ${stats.contributors.length} people`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-2xl font-semibold tabular-nums">{value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commits over time</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={CONFIG}>
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
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Languages</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <Table>
            <THead>
              <TR>
                <TH>Language</TH>
                <TH num>loc</TH>
                <TH num>share</TH>
                <TH num>comment</TH>
                <TH num>files</TH>
              </TR>
            </THead>
            <TBody>
              {stats.languages.map((lang) => (
                <TR key={lang.name}>
                  <TD>
                    <Badge variant="secondary">{lang.name}</Badge>
                  </TD>
                  <TD num>{num(lang.code)}</TD>
                  <TD num>{pct(lang.code, stats.code)}</TD>
                  <TD num>{num(lang.comment)}</TD>
                  <TD num>{num(lang.files)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
