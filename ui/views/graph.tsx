// owner: finn
// goal: commit list with the branch rails drawn beside it

import { useMemo, useState } from "react"
import { Badge } from "../components/badge.tsx"
import { Button } from "../components/button.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "../components/card.tsx"
import { Input } from "../components/input.tsx"
import { Onward } from "../components/onward.tsx"
import { toast } from "../components/toast.tsx"
import { locale } from "../lib/locale.ts"
import { copy } from "../lib/export.ts"
import { useDisplay } from "../lib/display.tsx"
import { backdrop, cycle, day, num } from "../lib/format.ts"
import { ADDED, REMOVED } from "../lib/series.ts"
import { cn } from "../lib/ui.ts"
import type { Sort } from "../lib/format.ts"
import type { Commit, Stats } from "../../src/model.ts"

// prettier-ignore
const LANES = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
  "#f97316", "#a855f7", "#22c55e", "#ef4444", "#14b8a6",
]

const color = (lane: number) => LANES[lane % LANES.length]

// number, subject, added, removed, author, date, hash
const COLS = "3.5rem minmax(0,1fr) 6rem 6rem 9rem 5.5rem 4.5rem"

type Numbered = Commit & { n: number }

// sort, filter reorder
const SORTS: Record<string, (a: Numbered, b: Numbered) => number> = {
  "#": (a, b) => a.n - b.n,
  subject: (a, b) => a.subject.localeCompare(b.subject),
  added: (a, b) => a.insertions - b.insertions,
  removed: (a, b) => a.deletions - b.deletions,
  author: (a, b) => a.author.localeCompare(b.author),
  date: (a, b) => a.date.localeCompare(b.date),
  hash: (a, b) => a.hash.localeCompare(b.hash),
}

// alignment match
const HEADS: { key: string; right?: boolean }[] = [
  { key: "#", right: true },
  { key: "subject" },
  { key: "added", right: true },
  { key: "removed", right: true },
  { key: "author" },
  { key: "date", right: true },
  { key: "hash", right: true },
]

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
      else if (i === 0)
        to = ((heads[lane] = parent), lane) // first parent keeps this lane
      else to = claim(parent)
      edges.push({ from: lane, to })
    })

    rows.push({ commit, lane, active, edges, linked })
  }
  return rows
}

const x = (lane: number) => PAD + lane * GAP

export function Graph({ stats, onTab }: { stats: Stats; onTab: (tab: string) => void }) {
  const { curve } = useDisplay()
  const [sort, setSort] = useState<Sort | null>(null)
  const [filter, setFilter] = useState("")

  const numbered = useMemo<Numbered[]>(
    () => stats.log.map((c, i) => ({ ...c, n: stats.commits - i })),
    [stats],
  )

  const shown = useMemo(() => {
    const needle = filter.toLowerCase()
    const kept = needle
      ? numbered.filter((c) =>
          `${c.subject} ${c.author} ${c.hash} ${c.refs}`.toLowerCase().includes(needle),
        )
      : numbered
    if (!sort) return kept
    const cmp = SORTS[sort.key]
    return [...kept].sort((a, b) => (sort.asc ? cmp(a, b) : -cmp(a, b)))
  }, [numbered, filter, sort])

  const railed = !sort && !filter
  const rows = useMemo(() => (railed ? place(shown) : []), [shown, railed])
  const peak = Math.max(1, ...stats.log.map((c) => c.insertions + c.deletions))
  const lanes = railed
    ? Math.max(
        1,
        ...rows.map((r) => Math.max(r.lane, ...r.active, ...r.edges.map((e) => e.to)) + 1),
      )
    : 0
  const width = railed ? PAD * 2 + lanes * GAP : 0

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <CardTitle>History</CardTitle>
            <span className="text-muted-foreground text-xs">
              {shown.length !== stats.log.length && `${shown.length} of `}
              {stats.log.length < stats.commits
                ? `latest ${stats.log.length} of ${num(stats.commits)} commits`
                : `all ${num(stats.commits)} commits`}
              {!railed && " · sorted, so the branch rails are hidden"}
            </span>
          </div>
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            {!railed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSort(null)
                  setFilter("")
                }}
              >
                reset
              </Button>
            )}
            <Input
              className="w-full sm:w-52"
              placeholder="filter subject, author, hash"
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 pt-2">
          <div
            style={{ paddingLeft: width, gridTemplateColumns: COLS }}
            className="text-muted-foreground grid min-w-[52rem] gap-3 border-b pr-3 pb-1 text-xs"
          >
            {HEADS.map((head) => (
              <button
                key={head.key}
                onClick={() => setSort(cycle(sort, head.key))}
                className={cn(
                  "hover:text-foreground cursor-pointer truncate",
                  head.right ? "text-right" : "text-left",
                )}
              >
                {head.key}
                {sort?.key === head.key && (sort.asc ? " ↑" : " ↓")}
              </button>
            ))}
          </div>
          <div className="flex min-w-[52rem]">
            {railed && (
              <svg width={width} height={rows.length * ROW} className="shrink-0">
                {rows.map((row, i) => {
                  const y = i * ROW + ROW / 2
                  return (
                    <g key={row.commit.hash} strokeWidth={2} fill="none">
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

                      {row.linked && (
                        <line
                          x1={x(row.lane)}
                          y1={y - ROW / 2}
                          x2={x(row.lane)}
                          y2={y}
                          stroke={color(row.lane)}
                        />
                      )}

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
            )}

            <div className="min-w-0 flex-1">
              {shown.map((commit) => (
                <div
                  key={commit.hash}
                  style={{ height: ROW, gridTemplateColumns: COLS }}
                  className="hover:bg-muted/50 grid items-center gap-3 pr-3 text-sm"
                >
                  <span className="text-muted-foreground text-right text-xs tabular-nums">
                    #{commit.n}
                  </span>

                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{commit.subject}</span>
                    {commit.refs &&
                      commit.refs.split(", ").map((ref) => (
                        <Badge
                          key={ref}
                          variant={ref.startsWith("HEAD") ? "default" : "secondary"}
                          className="max-w-40 shrink-0 truncate"
                        >
                          {ref.replace("HEAD -> ", "")}
                        </Badge>
                      ))}
                  </span>
                  <span
                    className="rounded-sm px-1 text-right text-xs tabular-nums"
                    style={{ color: ADDED, ...backdrop(commit.insertions, peak, ADDED, curve) }}
                  >
                    +{num(commit.insertions)}
                  </span>
                  <span
                    className="rounded-sm px-1 text-right text-xs tabular-nums"
                    style={{ color: REMOVED, ...backdrop(commit.deletions, peak, REMOVED, curve) }}
                  >
                    -{num(commit.deletions)}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">{commit.author}</span>
                  <span className="text-muted-foreground text-right text-xs tabular-nums">
                    {day(commit.date)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("justify-end px-0 font-mono text-xs")}
                    onClick={async () =>
                      toast(
                        (await copy(commit.hash)) ? `Copied ${commit.hash}` : "Copy blocked",
                        commit.subject,
                      )
                    }
                  >
                    {commit.hash}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Onward stats={stats} current="History" onTab={onTab} />
    </div>
  )
}
