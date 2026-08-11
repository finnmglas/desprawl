// owner: finn
// goal: commit list with the branch rails drawn beside it

import { useEffect, useMemo, useState } from "react"
import { Avatar } from "../components/atoms/avatar.tsx"
import { Back } from "../components/atoms/back.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Button } from "../components/atoms/button.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { Save } from "../components/molecules/save.tsx"
import { CopyButton } from "../components/molecules/copy-button.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import { Input } from "../components/atoms/input.tsx"
import { CommitDetail, DETAIL } from "../components/molecules/commit-detail.tsx"
import { Moved } from "../components/atoms/moved.tsx"
import { Onward } from "../components/molecules/onward.tsx"
import { Tip } from "../components/atoms/tip.tsx"
import { Working } from "../components/atoms/working.tsx"
import { toast } from "../components/atoms/toast.tsx"
import { copy } from "../lib/export.ts"
import { HINTS } from "../lib/hints.ts"
import { useDisplay } from "../lib/display.tsx"
import { backdrop, cycle, day, num, plural } from "../lib/format.ts"
import { commitDetail, isLive, olderCommits, trueCount } from "../lib/live.ts"
import { ADDED, REMOVED } from "../lib/series.ts"
import { cn } from "../lib/ui.ts"
import type { Sort } from "../lib/format.ts"
import type { Detail } from "../../src/history.ts"
import { place } from "../lib/lanes.ts"
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
  author: (a, b) => a.who - b.who,
  date: (a, b) => a.date.localeCompare(b.date),
  hash: (a, b) => a.hash.localeCompare(b.hash),
}

const HEADS: { key: string; right?: boolean }[] = [
  { key: "#", right: true },
  { key: "subject" },
  { key: "added", right: true },
  { key: "removed", right: true },
  { key: "author" },
  { key: "date", right: true },
  { key: "hash", right: true },
]

const PAGE = 200

const ROW = 34
const GAP = 14
const PAD = 10

const x = (lane: number) => PAD + lane * GAP

export function Graph({
  stats,
  from,
  to,
  onRange,
  onTab,
  onPath,
  faces,
}: {
  stats: Stats
  /** a window handed over from the chart, as two days */
  from: string
  to: string
  onRange: (from: string, to: string) => void
  onTab: (tab: string) => void
  onPath: (path: string[]) => void
  faces: Record<string, string>
}) {
  const who = (c: Commit) => stats.contributors[c.who] ?? { name: "", email: "" }
  const { curve } = useDisplay()
  const [sort, setSort] = useState<Sort | null>(null)
  const [filter, setFilter] = useState("")
  const [limit, setLimit] = useState(PAGE)
  const [extra, setExtra] = useState<Commit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState("")
  const [detail, setDetail] = useState<Detail | null>(null)

  const toggle = (hash: string) => {
    if (open === hash) return setOpen("")
    setOpen(hash)
    setDetail(null)
    void commitDetail(hash).then(setDetail)
  }
  const [total, setTotal] = useState(stats.commits)

  // slow to count, so it lands after paint
  useEffect(() => {
    if (stats.truncated) void trueCount().then((n) => n && setTotal(n))
  }, [stats.truncated])

  const log = useMemo(() => [...stats.log, ...extra], [stats.log, extra])

  const more = async () => {
    if (limit < log.length) return setLimit(limit + PAGE * 2)
    if (!isLive()) return
    setLoading(true)
    const older = await olderCommits(log.length, PAGE * 2)
    setExtra((prev) => [...prev, ...older])
    setLimit(limit + PAGE * 2)
    setLoading(false)
  }

  const numbered = useMemo<Numbered[]>(
    () => log.map((c, i) => ({ ...c, n: total - i })),
    [log, total],
  )

  const shown = useMemo(() => {
    const needle = filter.toLowerCase()
    const windowed =
      from || to
        ? numbered.filter(
            (c) => c.date.slice(0, 10) >= from && c.date.slice(0, 10) <= (to || "9999"),
          )
        : numbered
    const kept = needle
      ? windowed.filter((c) =>
          `${c.subject} ${stats.contributors[c.who]?.name ?? ""} ${c.hash} ${c.refs}`
            .toLowerCase()
            .includes(needle),
        )
      : windowed
    if (!sort) return kept
    const cmp = SORTS[sort.key]
    return [...kept].sort((a, b) => (sort.asc ? cmp(a, b) : -cmp(a, b)))
  }, [numbered, filter, sort, from, to])

  const railed = !sort && !filter && !from && !to
  const paged = useMemo(() => shown.slice(0, limit), [shown, limit])
  const rows = useMemo(() => (railed ? place(paged) : []), [paged, railed])
  // an opened row is taller, so every y below it shifts by the same amount
  const tops = useMemo(() => {
    let y = 0
    return paged.map((commit) => {
      const top = y
      y += ROW + (commit.hash === open ? DETAIL : 0)
      return top
    })
  }, [paged, open])
  const height = (tops.at(-1) ?? 0) + ROW + (paged.some((c) => c.hash === open) ? DETAIL : 0)
  const peak = Math.max(1, ...log.map((c) => c.insertions + c.deletions))
  const lanes = railed
    ? Math.max(
        1,
        ...rows.map((r) => Math.max(r.lane, ...r.active, ...r.edges.map((e) => e.to)) + 1),
      )
    : 0
  const width = railed ? PAD * 2 + lanes * GAP : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Back onTab={onTab} />
        <Save
          className="ml-auto"
          name="history"
          rows={() => [
            ["date", "hash", "author", "added", "removed", "subject"],
            ...shown.map((c) => [
              c.date.slice(0, 10),
              c.hash,
              stats.contributors[c.who]?.name ?? "unknown",
              c.insertions,
              c.deletions,
              c.subject,
            ]),
          ]}
          note={`${plural(shown.length, "commit")}, as`}
        />
      </div>
      <Card>
        <CardHead
          title={
            <span className="flex items-center gap-1">
              History
              <Working on={loading} />
            </span>
          }
          hint={
            <>
              {shown.length !== stats.log.length && `${shown.length} of `}
              {log.length < total
                ? `latest ${num(log.length)} of ${num(total)}`
                : `all ${num(total)}`}{" "}
              commits
              {(from || to) && ` · between ${from || "the start"} and ${to || "now"}`}
              {!railed && " · sorted, so the branch rails are hidden"}
            </>
          }
        >
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <CopyButton
              label="Copy these commits, as text"
              text={() =>
                shown
                  .map(
                    (c) =>
                      `${c.date.slice(0, 10)}\t${c.hash}\t${stats.contributors[c.who]?.name ?? "unknown"}\t+${c.insertions}\t-${c.deletions}\t${c.subject}`,
                  )
                  .join("\n")
              }
              message={`Copied ${plural(shown.length, "commit")}`}
              note="Date, hash, who, lines moved and the subject"
            />
            {(from || to) && (
              <Button variant="outline" size="sm" onClick={() => onRange("", "")}>
                {from} to {to} ✕
              </Button>
            )}
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
        </CardHead>
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
                <Tip text={HINTS[head.key]} side="bottom">
                  {head.key}
                  {sort?.key === head.key && (sort.asc ? " ↑" : " ↓")}
                </Tip>
              </button>
            ))}
          </div>
          <div className="flex min-w-[52rem]">
            {railed && (
              <svg data-print="hide" width={width} height={height} className="shrink-0">
                {rows.map((row, i) => {
                  const top = tops[i] ?? i * ROW
                  const grown = row.commit.hash === open ? DETAIL : 0
                  const y = top + ROW / 2
                  return (
                    <g key={row.commit.hash} strokeWidth={2} fill="none">
                      {/* an opened row is taller, so every rail through it stretches to match */}
                      {row.active.map((lane) => (
                        <line
                          key={lane}
                          x1={x(lane)}
                          y1={top}
                          x2={x(lane)}
                          y2={top + ROW + grown}
                          stroke={color(lane)}
                        />
                      ))}

                      {row.linked && (
                        <line
                          x1={x(row.lane)}
                          y1={top}
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
                              ? `M${x(edge.from)},${y} L${x(edge.to)},${top + ROW + grown}`
                              : `M${x(edge.from)},${y} C${x(edge.from)},${y + ROW / 4} ${x(edge.to)},${y + ROW / 4} ${x(edge.to)},${top + ROW + grown}`
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
              {paged.map((commit) => (
                <div key={commit.hash}>
                  <div
                    onClick={() => toggle(commit.hash)}
                    style={{ height: ROW, gridTemplateColumns: COLS }}
                    className="hover:bg-muted/50 grid cursor-pointer items-center gap-3 pr-3 text-sm"
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
                    <Moved
                      n={commit.insertions}
                      kind="ins"
                      className="rounded-sm px-1 text-right text-xs"
                      style={backdrop(commit.insertions, peak, ADDED, curve)}
                    />
                    <Moved
                      n={commit.deletions}
                      kind="del"
                      className="rounded-sm px-1 text-right text-xs"
                      style={backdrop(commit.deletions, peak, REMOVED, curve)}
                    />
                    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                      <Avatar
                        name={who(commit).name}
                        email={who(commit).email}
                        found={faces[who(commit).email.toLowerCase()]}
                        className="size-5 text-[9px]"
                      />
                      <span className="truncate">{who(commit).name}</span>
                    </span>
                    <span className="text-muted-foreground text-right text-xs tabular-nums">
                      {day(commit.date)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("justify-end px-0 font-mono text-xs")}
                      onClick={async (event) => {
                        event.stopPropagation() // copying must not also open the detail
                        toast(
                          (await copy(commit.hash)) ? `Copied ${commit.hash}` : "Copy blocked",
                          commit.subject,
                        )
                      }}
                    >
                      {commit.hash}
                    </Button>
                  </div>
                  {open === commit.hash && (
                    <CommitDetail
                      commit={detail}
                      live={isLive()}
                      onFile={(path) => onPath(path.split("/").slice(0, -1))}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          {(limit < shown.length || (isLive() && log.length < total)) && (
            <button
              onClick={() => void more()}
              className="hover:bg-muted/50 text-muted-foreground w-full cursor-pointer py-2 text-center text-xs"
            >
              {loading ? "loading…" : `show more, ${num(Math.max(0, total - limit))} left`}
            </button>
          )}
        </CardContent>
      </Card>

      <Onward stats={stats} current="History" onTab={onTab} />
    </div>
  )
}
