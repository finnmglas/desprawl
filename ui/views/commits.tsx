// owner: finn
// goal: the commit log as a panel, branch rails drawn per row so a windowed table keeps them

import { useEffect, useMemo, useState } from "react"
import { Avatar } from "../components/atoms/avatar.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Button } from "../components/atoms/button.tsx"
import { Dialog } from "../components/atoms/dialog.tsx"
import { Moved } from "../components/atoms/moved.tsx"
import { Section } from "../components/atoms/section.tsx"
import { Working } from "../components/atoms/working.tsx"
import { toast } from "../components/atoms/toast.tsx"
import { CommitDetail } from "../components/molecules/commit-detail.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { copy } from "../lib/export.ts"
import { useDisplay } from "../lib/display.tsx"
import { backdrop, day, num, plural } from "../lib/format.ts"
import { commitDetail, isLive, olderCommits, trueCount } from "../lib/live.ts"
import { file as asFile, useGoing } from "../lib/going.tsx"
import { place } from "../lib/lanes.ts"
import { ADDED, REMOVED } from "../lib/series.ts"
import { cn } from "../lib/ui.ts"
import type { Sort } from "../lib/format.ts"
import type { Detail } from "../../src/history.ts"
import type { Commit, Stats } from "../../src/model.ts"

// prettier-ignore
const LANES = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
  "#f97316", "#a855f7", "#22c55e", "#ef4444", "#14b8a6",
]

const color = (lane: number) => LANES[lane % LANES.length]

const GAP = 14
const PAD = 10
const x = (lane: number) => PAD + lane * GAP

const PAGE = 400

type Numbered = Commit & { n: number }

/**
 * One row's worth of rail. Heights are percentages of whatever the row turned out to be,
 * so nothing here depends on a row height anyone had to write down, and a row that was
 * never built costs nothing: its neighbours still meet at the boundary.
 */
function Rail({ row, width }: { row: ReturnType<typeof place>[number]; width: number }) {
  const dot = row.commit.parents.length > 1 ? 4.5 : 3.5
  return (
    // absolute, so the drawing fills the row instead of deciding how tall it is
    <svg data-print="hide" width={width} height="100%" className="absolute inset-y-0 left-0">
      <g strokeWidth={2} fill="none">
        {/* lanes waiting on something further down pass straight through */}
        {row.active.map((lane) => (
          <line key={lane} x1={x(lane)} y1="0" x2={x(lane)} y2="100%" stroke={color(lane)} />
        ))}
        {/* a child above pointed here, so the lane arrives from the top */}
        {row.linked && (
          <line x1={x(row.lane)} y1="0" x2={x(row.lane)} y2="50%" stroke={color(row.lane)} />
        )}
        {/* and leaves towards whichever lane its parent sits on. A path takes no
            percentages, so these live in a box measured 0 to 100 down and stretched to
            the row: the width matches one to one, so only the height is scaled */}
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} 100`}
          preserveAspectRatio="none"
          overflow="visible"
        >
          {row.edges.map((edge) => (
            <path
              key={`${edge.from}-${edge.to}`}
              vectorEffect="non-scaling-stroke"
              d={
                edge.from === edge.to
                  ? `M${x(edge.from)},50 L${x(edge.to)},100`
                  : `M${x(edge.from)},50 C${x(edge.from)},75 ${x(edge.to)},75 ${x(edge.to)},100`
              }
              stroke={color(edge.to)}
            />
          ))}
        </svg>
      </g>
      <circle cx={x(row.lane)} cy="50%" r={dot} fill={color(row.lane)} stroke="var(--background)" />
    </svg>
  )
}

export function Commits({
  stats,
  from,
  to,
  onRange,
  faces,
}: {
  stats: Stats
  /** a window handed over from the timeline, as two days */
  from: string
  to: string
  onRange: (from: string, to: string) => void
  faces: Record<string, string>
}) {
  const who = (c: Commit) => stats.contributors[c.who] ?? { name: "", email: "" }
  const { open: ask } = useGoing()
  const { curve } = useDisplay()
  const [extra, setExtra] = useState<Commit[]>([])
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState<Numbered | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  // the table sorts and searches itself, and either one breaks the order the rails
  // were laid out in, so it says when it has
  const [sort, setSort] = useState<Sort | null>(null)
  const [hunt, setHunt] = useState("")
  const [total, setTotal] = useState(stats.commits)

  // slow to count, so it lands after paint
  useEffect(() => {
    if (stats.truncated) void trueCount().then((n) => n && setTotal(n))
  }, [stats.truncated])

  const log = useMemo(() => [...stats.log, ...extra], [stats.log, extra])
  const older = async () => {
    if (loading || !isLive()) return
    setLoading(true)
    const got = await olderCommits(log.length, PAGE)
    setExtra((prev) => [...prev, ...got])
    setLoading(false)
  }

  const open = (commit: Numbered) => {
    setReading(commit)
    setDetail(null)
    void commitDetail(commit.hash).then(setDetail)
  }

  const rows = useMemo<Numbered[]>(() => {
    const numbered = log.map((c, i) => ({ ...c, n: total - i }))
    if (!from && !to) return numbered
    return numbered.filter(
      (c) => c.date.slice(0, 10) >= from && c.date.slice(0, 10) <= (to || "9999"),
    )
  }, [log, total, from, to])

  // rails only mean anything while the rows are in the order the log put them in
  const railed = !sort && !hunt && !from && !to
  const placed = useMemo(() => (railed ? place(rows) : []), [rows, railed])
  const byHash = useMemo(() => new Map(placed.map((one) => [one.commit.hash, one])), [placed])
  const lanes = railed
    ? Math.max(
        1,
        ...placed.map((r) => Math.max(r.lane, ...r.active, ...r.edges.map((e) => e.to)) + 1),
      )
    : 0
  const width = railed ? PAD * 2 + lanes * GAP : 0
  const peak = Math.max(1, ...log.map((c) => c.insertions + c.deletions))

  const columns: Column<Numbered>[] = [
    ...(railed
      ? [
          {
            key: "rail",
            label: "",
            flat: true,
            left: true,
            behind: true,
            width: width + 16, // its own size, padding included, never the leftover
            get: () => "",
            cell: (c: Numbered) => {
              const row = byHash.get(c.hash)
              if (!row) return null
              return (
                <>
                  {/* holds the column open, since the drawing itself is out of flow */}
                  <span className="block" style={{ width }} />
                  <Rail row={row} width={width} />
                </>
              )
            },
            hint: "which branch the commit sits on, and where it merges",
          } as Column<Numbered>,
        ]
      : []),
    {
      key: "n",
      label: "#",
      num: true,
      flat: true,
      get: (c) => c.n,
      cell: (c) => <span className="text-muted-foreground text-xs">#{num(c.n)}</span>,
    },
    {
      key: "subject",
      label: "subject",
      get: (c) => c.subject,
      // capped, or the longest subject in the whole log decides the width every other
      // column then has to share what is left of
      cell: (c) => (
        <span className="flex min-w-0 max-w-[34rem] items-center gap-2">
          <span className="truncate">{c.subject}</span>
          {c.refs &&
            c.refs.split(", ").map((ref) => (
              <Badge
                key={ref}
                variant={ref.startsWith("HEAD") ? "default" : "secondary"}
                className="max-w-40 shrink-0 truncate"
              >
                {ref.replace("HEAD -> ", "")}
              </Badge>
            ))}
        </span>
      ),
    },
    {
      key: "added",
      label: "added",
      num: true,
      flat: true,
      get: (c) => c.insertions,
      cell: (c) => (
        <Moved
          n={c.insertions}
          kind="ins"
          className="rounded-sm px-1 text-right text-xs"
          style={backdrop(c.insertions, peak, ADDED, curve)}
        />
      ),
    },
    {
      key: "removed",
      label: "removed",
      num: true,
      flat: true,
      get: (c) => c.deletions,
      cell: (c) => (
        <Moved
          n={c.deletions}
          kind="del"
          className="rounded-sm px-1 text-right text-xs"
          style={backdrop(c.deletions, peak, REMOVED, curve)}
        />
      ),
    },
    {
      key: "author",
      label: "author",
      get: (c) => who(c).name,
      cell: (c) => (
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <Avatar
            name={who(c).name}
            email={who(c).email}
            found={faces[who(c).email.toLowerCase()]}
            className="size-5 text-[9px]"
          />
          <span className="truncate">{who(c).name}</span>
        </span>
      ),
    },
    {
      key: "date",
      label: "date",
      num: true,
      flat: true,
      get: (c) => c.date,
      cell: (c) => <span className="text-muted-foreground text-xs">{day(c.date)}</span>,
    },
    {
      key: "hash",
      label: "hash",
      num: true,
      flat: true,
      get: (c) => c.hash,
      cell: (c) => (
        <Button
          variant="ghost"
          size="sm"
          className={cn("justify-end px-0 font-mono text-xs")}
          onClick={async (event) => {
            event.stopPropagation() // copying must not also open the commit
            toast((await copy(c.hash)) ? `Copied ${c.hash}` : "Copy blocked", c.subject)
          }}
        >
          {c.hash}
        </Button>
      ),
    },
  ]

  return (
    <Section id="history_commits">
      <DataTable
        title={
          <span className="flex items-center gap-1">
            History
            <Working on={loading} />
          </span>
        }
        hint={
          (log.length < total
            ? `latest ${num(log.length)} of ${num(total)} commits`
            : `all ${num(total)} commits`) +
          (from || to ? ` · between ${from || "the start"} and ${to || "now"}` : "") +
          (railed ? "" : " · not in log order, so the branch rails are hidden")
        }
        file="history"
        columns={columns}
        rows={rows}
        id={(c) => c.hash}
        onRowClick={open}
        onSort={setSort}
        onFind={setHunt}
        onEnd={() => void older()}
        saves={[
          {
            name: "history",
            label: "Commits",
            note: `${plural(rows.length, "commit")}, as`,
            rows: () => [
              ["date", "hash", "author", "added", "removed", "subject"],
              ...rows.map((c) => [
                c.date.slice(0, 10),
                c.hash,
                who(c).name || "unknown",
                c.insertions,
                c.deletions,
                c.subject,
              ]),
            ],
          },
        ]}
      >
        {(from || to) && (
          <Button variant="outline" size="sm" onClick={() => onRange("", "")}>
            {from} to {to} ✕
          </Button>
        )}
      </DataTable>

      <Dialog
        open={!!reading}
        onClose={() => setReading(null)}
        title={
          reading && (
            <>
              <div className="text-base font-semibold">{reading.subject}</div>
              <div className="text-muted-foreground font-mono text-xs">
                {reading.hash} · {day(reading.date)} · {who(reading).name}
              </div>
            </>
          )
        }
        className="max-w-3xl"
      >
        <CommitDetail commit={detail} live={isLive()} onFile={(path) => ask(asFile(path))} />
      </Dialog>
    </Section>
  )
}
