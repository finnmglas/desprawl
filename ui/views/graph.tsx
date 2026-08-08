// owner: finn
// goal: commit list with the branch rails drawn beside it

import { useMemo } from "react"
import { Badge } from "../components/badge.tsx"
import { Button } from "../components/button.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "../components/card.tsx"
import { toast } from "../components/toast.tsx"
import { copy } from "../lib/export.ts"
import { day } from "../lib/format.ts"
import { cn } from "../lib/ui.ts"
import type { Commit, Stats } from "../../src/model.ts"

const LANES = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
  "#f97316", "#a855f7", "#22c55e", "#ef4444", "#14b8a6",
]

const color = (lane: number) => LANES[lane % LANES.length]

const ROW = 34
const GAP = 14
const PAD = 10

interface Placed {
  commit: Commit
  lane: number
  /** Lanes waiting on something else, drawn through the whole row. */
  active: number[]
  /** lane -> lane edges leaving this row downward, into the next row's top. */
  edges: { from: number; to: number }[]
  /** A child above already drew into this lane, so it needs an upper half. */
  linked: boolean
}

/** Assign each commit a lane, newest first, reusing a lane once its child is drawn. */
function place(log: Commit[]): Placed[] {
  const heads: (string | null)[] = [] // lane -> hash it is waiting for
  const rows: Placed[] = []

  const claim = (hash: string): number => {
    const open = heads.indexOf(hash)
    if (open !== -1) return open
    const free = heads.indexOf(null)
    if (free !== -1) {
      heads[free] = hash
      return free
    }
    heads.push(hash)
    return heads.length - 1
  }

  for (const commit of log) {
    const linked = heads.includes(commit.hash) // a child above pointed here
    const lane = claim(commit.hash)
    // every lane still waiting on something else is drawn through this row
    const active = heads.map((h, i) => (h ? i : -1)).filter((i) => i !== -1 && i !== lane)
    const edges: { from: number; to: number }[] = []

    heads[lane] = null
    commit.parents.forEach((parent, i) => {
      // a parent another lane already waits for joins that lane, it must not be claimed twice
      const waiting = heads.indexOf(parent)
      let to: number
      if (waiting !== -1) to = waiting
      else if (i === 0) to = ((heads[lane] = parent), lane) // first parent keeps this lane
      else to = claim(parent)
      edges.push({ from: lane, to })
    })

    rows.push({ commit, lane, active, edges, linked })
  }
  return rows
}

const x = (lane: number) => PAD + lane * GAP

export function Graph({ stats }: { stats: Stats }) {
  const rows = useMemo(() => place(stats.log), [stats.log])
  const lanes = Math.max(1, ...rows.map((r) => Math.max(r.lane, ...r.active, ...r.edges.map((e) => e.to)) + 1))
  const width = PAD * 2 + lanes * GAP

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle>History</CardTitle>
          <span className="text-muted-foreground text-xs">
            {stats.log.length < stats.commits
              ? `latest ${stats.log.length} of ${stats.commits.toLocaleString("en-US")} commits`
              : `all ${stats.commits.toLocaleString("en-US")} commits`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        <div className="relative flex">
          <svg width={width} height={rows.length * ROW} className="shrink-0">
            {rows.map((row, i) => {
              const y = i * ROW + ROW / 2
              return (
                <g key={row.commit.hash} strokeWidth={2} fill="none">
                  {/* lanes waiting on a commit further down, full height */}
                  {row.active.map((lane) => (
                    <line
                      key={lane}
                      x1={x(lane)}
                      y1={y - ROW / 2}
                      x2={x(lane)}
                      y2={y + ROW / 2}
                      stroke={color(lane)}
                    />
                  ))}
                  {/* upper half, meeting whatever drew into this lane from above */}
                  {row.linked && (
                    <line
                      x1={x(row.lane)}
                      y1={y - ROW / 2}
                      x2={x(row.lane)}
                      y2={y}
                      stroke={color(row.lane)}
                    />
                  )}
                  {/* lower half, stopping exactly where the next row's top begins */}
                  {row.edges.map((edge) => (
                    <path
                      key={`${edge.from}-${edge.to}`}
                      d={
                        edge.from === edge.to
                          ? `M${x(edge.from)},${y} L${x(edge.to)},${y + ROW / 2}`
                          : `M${x(edge.from)},${y} C${x(edge.from)},${y + ROW / 4} ${x(edge.to)},${y + ROW / 4} ${x(edge.to)},${y + ROW / 2}`
                      }
                      stroke={color(edge.to)}
                    />
                  ))}
                  <circle
                    cx={x(row.lane)}
                    cy={y}
                    r={row.commit.parents.length > 1 ? 4.5 : 3.5}
                    fill={color(row.lane)}
                    stroke="var(--background)"
                  />
                </g>
              )
            })}
          </svg>

          <div className="min-w-0 flex-1">
            {rows.map((row) => (
              <div
                key={row.commit.hash}
                style={{ height: ROW }}
                className="hover:bg-muted/50 flex min-w-0 items-center gap-2 pr-3 text-sm"
              >
                <span className="truncate">{row.commit.subject}</span>
                {row.commit.refs && (
                  <span className="flex shrink-0 gap-1">
                    {row.commit.refs.split(", ").map((ref) => (
                      <Badge
                        key={ref}
                        variant={ref.startsWith("HEAD") ? "default" : "secondary"}
                        className="max-w-48 truncate"
                      >
                        {ref.replace("HEAD -> ", "")}
                      </Badge>
                    ))}
                  </span>
                )}
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {row.commit.author}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {day(row.commit.date)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("shrink-0 font-mono text-xs")}
                  onClick={async () =>
                    toast(
                      (await copy(row.commit.hash)) ? `Copied ${row.commit.hash}` : "Copy blocked",
                      row.commit.subject,
                    )
                  }
                >
                  {row.commit.hash}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
