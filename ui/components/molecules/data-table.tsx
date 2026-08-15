// owner: finn
// goal: one column spec drives render, sort and export

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "../atoms/card.tsx"
import { CardHead } from "./card-head.tsx"
import { CopyButton } from "./copy-button.tsx"
import { Save, type Sheet } from "./save.tsx"
import { TBody, TD, TH, THead, TR, Table } from "../atoms/table.tsx"
import { Tip } from "../atoms/tip.tsx"
import { type Column } from "../../lib/columns.ts"
import { Find } from "./find.tsx"
import { delimit } from "../../lib/export.ts"
import { HINTS } from "../../lib/hints.ts"
import { backdrop, cycle, pct } from "../../lib/format.ts"
import { effective, shares } from "../../lib/scale.ts"
import { HOLDS, useDisplay } from "../../lib/display.tsx"
import type { Sort } from "../../lib/format.ts"
import { cn } from "../../lib/ui.ts"

export type { Column }

/** past this many rows the browser is laying out more than anyone will ever look at */
const WINDOW_FROM = 60
/** rows built either side of the view, so a fast scroll does not show blank */
const OVERSCAN = 6

export interface DataTableProps<T> {
  title: React.ReactNode
  hint?: string
  columns: Column<T>[]
  rows: T[]
  /** Stable key per row. */
  id: (row: T) => string
  onRowClick?: (row: T) => void
  rowStyle?: (row: T) => React.CSSProperties | undefined
  /** Extra controls in the header. */
  children?: React.ReactNode
  className?: string
  /** Total row pinned to the bottom. */
  total?: T
  /** the order the reader chose, for anything drawing the same rows elsewhere */
  onSort?: (sort: Sort | null) => void
  /** what an export is called, when the title is not plain words */
  file?: string
  /** more tables that come off this panel, offered inside its save button */
  saves?: Sheet[]
  /** what the reader typed into the search, for a total row that has to agree with it */
  onFind?: (said: string) => void
  /** scrolled to the end of what is loaded, for a list that has more behind it */
  onEnd?: () => void
  /** the row the reader came here to see: marked, unfolded and scrolled to, since
   * arriving at a table of four hundred rows with nothing pointed out is arriving nowhere */
  mark?: (row: T) => boolean
}

export function DataTable<T>({
  title,
  hint,
  columns,
  rows,
  id,
  onRowClick,
  rowStyle,
  children,
  className,
  total,
  file,
  saves,
  onSort,
  onFind,
  onEnd,
  mark,
}: DataTableProps<T>) {
  const { scale, curve, rows: shown_ } = useDisplay()
  const holds = HOLDS[shown_]
  // 5 and 10 fold, virtual and all do not
  const limit = shown_ === "5" || shown_ === "10" ? holds : undefined
  // only the scrolling mode has a floor to pin anything to
  const pinned = shown_ === "virtual"
  const sheet = useRef<HTMLDivElement>(null)
  const spot = useRef<HTMLTableRowElement>(null)
  const [sort, setSort] = useState<Sort | null>(null)
  const [open, setOpen] = useState(false)
  const [hunt, setHunt] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  // rows carry avatars and badges, so a row height is not a number anyone can write
  // down: it is measured off a real row once the table has painted, and ten of it is
  // how tall the box stands
  const [unit, setUnit] = useState(0)
  const [tall, setTall] = useState(0)
  const [scrolled, setScrolled] = useState(0)
  // a table sizes its columns from the rows it can see, and a windowed table can only
  // see a slice, so scrolling would resize them under the reader. Measured once off a
  // full paint and then held, so a column is the same width at the top and the bottom
  const [widths, setWidths] = useState<number[]>([])

  // a table nobody has to scroll is a table nobody searches, so the search appears once
  // there is more than a screenful of it, whichever way this one is being shown
  const searchable = rows.length > (holds || 10)
  const rows_ = useMemo(() => {
    const said = hunt.trim().toLowerCase()
    if (!said || !searchable) return rows
    return rows.filter((row) =>
      columns.some((col) => String(col.get(row)).toLowerCase().includes(said)),
    )
  }, [rows, columns, hunt, searchable])

  const sums = useMemo(() => {
    const found: Record<string, number> = {}
    for (const col of columns) {
      if (!col.num) continue
      let sum = 0
      for (const row of rows_) {
        const value = col.get(row)
        if (typeof value === "number") sum += value
      }
      found[col.key] = sum
    }
    return found
  }, [columns, rows_])

  // num means the column is right aligned, not that it holds numbers: a date is a string
  // sitting in one, and a string column adds up to nothing without anything being wrong
  const counted = useMemo(
    () =>
      new Set(
        columns
          .filter(
            (col) => col.num && !col.good && rows_.some((row) => typeof col.get(row) === "number"),
          )
          .map((col) => col.key),
      ),
    [columns, rows_],
  )

  const share = (col: Column<T>) => shares(col, scale)
  const scaled = (col: Column<T>, row: T) => effective(col, row, scale, sums)

  const sorted = useMemo(() => {
    if (!sort) return rows_
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows_
    return [...rows_].sort((a, b) => {
      const [x, y] = [scaled(col, a), scaled(col, b)]
      const cmp =
        typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))
      return sort.asc ? cmp : -cmp
    })
  }, [rows_, sort, columns, scale])

  // peaks follow the same values, shares bar against the biggest share
  const peaks = useMemo(() => {
    const found: Record<string, number> = {}
    for (const col of columns) {
      if (!col.num || col.flat) continue
      let peak = 0
      for (const row of rows_) {
        const at = scaled(col, row)
        if (typeof at === "number" && at > peak) peak = at
      }
      found[col.key] = peak
    }
    return found
  }, [columns, rows_, scale])

  // the fold hides rows, peaks and export still see them all
  const foldable = limit !== undefined && sorted.length > limit
  const shown = foldable && !open ? sorted.slice(0, limit) : sorted
  const hidden = foldable ? sorted.length - limit : 0
  // a table is never shorter than the height it was asked for, so a panel holding two
  // rows sits as calmly as one holding ten: the difference is space, not size
  const padding = Math.max(0, holds - shown.length)

  // measured after paint: one real row is the unit, and ten of it plus the head is the box
  useEffect(() => {
    const box = scroller.current
    if (!pinned || !box) {
      setTall(0)
      return setUnit(0)
    }
    const head = box.querySelector("thead")
    const row = box.querySelector("tbody > tr[data-row]")
    if (!head || !row) return
    const one = row.getBoundingClientRect().height
    if (!one) return
    setUnit(one)
    setTall(Math.round(head.getBoundingClientRect().height + HOLDS.virtual * one))
  }, [pinned, sorted.length, columns.length, open])

  // measured while every row is still in the dom, which is the first paint of any table,
  // and left alone after that: reading them again once they are set only reads back what
  // was set, and re-fitting on scroll is the jump this exists to stop
  useEffect(() => {
    const head = sheet.current?.querySelector("thead tr")
    if (!head || widths.length === columns.length) return
    const found = [...head.children].map(
      (th, i) => columns[i]?.width ?? Math.round(th.getBoundingClientRect().width),
    )
    if (found.every((n) => n > 0)) setWidths(found)
  }, [columns.length, widths.length, rows])

  // a scroll box with every row in it is a scroll box the browser lays out every row of,
  // so past a point only what is on screen is built, with blank space standing in for
  // the rest. Under that point the whole list is cheaper than the arithmetic
  const windowed = pinned && unit > 0 && shown.length > WINDOW_FROM
  const first = windowed ? Math.max(0, Math.floor(scrolled / unit) - OVERSCAN) : 0
  const last_ = windowed
    ? Math.min(shown.length, Math.ceil((scrolled + tall) / unit) + OVERSCAN)
    : shown.length
  const slice = windowed ? shown.slice(first, last_) : shown

  // the scroll position drives which rows exist, read once a frame rather than per event
  useEffect(() => {
    const box = scroller.current
    if (!windowed || !box) return
    let queued = 0
    const onScroll = () => {
      if (queued) return
      queued = requestAnimationFrame(() => {
        queued = 0
        setScrolled(box.scrollTop)
        // within a few rows of the floor, so more arrives before the reader hits it
        if (box.scrollTop + box.clientHeight >= box.scrollHeight - unit * 3) onEnd?.()
      })
    }
    box.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(queued)
      box.removeEventListener("scroll", onScroll)
    }
  }, [windowed, unit, onEnd])

  // a new list is a new place, so it starts at the top rather than mid way down the old
  // one. Keyed on what the reader changed, never on the rows array: callers rebuild that
  // every render, and depending on it would scroll every table back to the top forever
  useEffect(() => {
    if (!windowed) return
    if (scroller.current) scroller.current.scrollTop = 0
    setScrolled(0)
  }, [hunt, sort?.key, sort?.asc, rows.length])

  const marked = mark ? sorted.find(mark) : undefined
  const at = marked ? id(marked) : ""
  useEffect(() => {
    if (!marked) return
    // a marked row behind the fold is a row nobody sees, so the fold gives way to it
    if (!shown.includes(marked)) return setOpen(true)
    // and one that was never built cannot be scrolled to, so its place is worked out
    if (windowed) {
      const i = shown.indexOf(marked)
      const box = scroller.current
      if (i >= 0 && box) {
        box.scrollTop = Math.max(0, i * unit - tall / 2)
        setScrolled(box.scrollTop)
      }
      return
    }
    spot.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [at, open, windowed])

  const matrix = () => [
    columns.map((c) => c.label),
    ...sorted.map((row) => columns.map((c) => scaled(c, row))),
  ]
  // a title can carry a mark beside it, so the file name comes from its words only
  const slug = (typeof title === "string" ? title : (file ?? "table"))
    .toLowerCase()
    .replace(/\W+/g, "-")

  return (
    <Card className={className}>
      <CardHead title={title} hint={hint}>
        <div className="ml-auto flex items-center gap-1">
          {children}
          {searchable && (
            <Find
              value={hunt}
              onChange={(said) => {
                setHunt(said)
                onFind?.(said)
              }}
            />
          )}
          <CopyButton
            text={() => delimit(matrix(), "\t")}
            message={`Copied ${sorted.length} rows`}
            note="Paste straight into a sheet"
          />
          <Save
            name={slug}
            rows={matrix}
            picture={() => sheet.current}
            note={`${sorted.length} rows, as`}
            extra={saves}
          />
        </div>
      </CardHead>
      <CardContent className="p-0 pt-2">
        {/* a picture of it holds the rows on screen, so the fold decides what is in one */}
        <div ref={sheet}>
          <Table
            className={cn(widths.length === columns.length && "table-fixed")}
            boxRef={scroller}
            box={cn(pinned && "overflow-y-auto")}
            boxStyle={pinned && tall ? { height: tall } : undefined}
          >
            {widths.length === columns.length && (
              <colgroup>
                {widths.map((w, i) => (
                  <col key={columns[i].key} style={{ width: w }} />
                ))}
              </colgroup>
            )}
            <THead className={cn(pinned && "bg-card sticky top-0 z-20")}>
              <TR>
                {columns.map((col) => (
                  <TH
                    key={col.key}
                    num={col.num && !col.left}
                    onClick={() => {
                      const next = cycle(sort, col.key)
                      setSort(next)
                      onSort?.(next)
                    }}
                    className="hover:text-foreground cursor-pointer select-none"
                  >
                    <Tip text={col.hint ?? HINTS[col.label]} side="bottom">
                      <span>
                        {col.label}
                        {sort?.key === col.key && (sort.asc ? " ↑" : " ↓")}
                      </span>
                    </Tip>
                    {/* a column of nothing but zeros is usually a number that could not be
                      read, not a column of real zeros, and either way it says nothing */}
                    {counted.has(col.key) && sums[col.key] === 0 && (
                      <Tip
                        text="every row reads 0: nothing to count, or the number could not be read"
                        side="bottom"
                      >
                        <span className="ml-1 cursor-help">⚠️</span>
                      </Tip>
                    )}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {windowed && first > 0 && (
                <tr aria-hidden style={{ height: Math.round(first * unit) }} />
              )}
              {slice.map((row) => (
                <TR
                  key={id(row)}
                  data-row
                  ref={row === marked ? spot : undefined}
                  onClick={() => onRowClick?.(row)}
                  style={rowStyle?.(row)}
                  className={cn(
                    onRowClick && "cursor-pointer",
                    // a tint, not a ring: a collapsed table paints no shadow on a row
                    row === marked && "bg-sky-500/15 hover:bg-sky-500/20",
                  )}
                >
                  {columns.map((col) => {
                    const cell = scaled(col, row)
                    return (
                      <TD
                        key={col.key}
                        num={col.num && !col.left}
                        className={cn(col.behind && "relative")}
                        style={
                          typeof cell === "number"
                            ? backdrop(cell, peaks[col.key], "var(--chart-2)", curve)
                            : undefined
                        }
                      >
                        {share(col) && typeof cell === "number"
                          ? pct(cell, 1)
                          : col.cell
                            ? col.cell(row)
                            : cell}
                      </TD>
                    )
                  })}
                </TR>
              ))}
              {windowed && last_ < shown.length && (
                <tr aria-hidden style={{ height: Math.round((shown.length - last_) * unit) }} />
              )}
              {foldable && (
                <TR className="hover:bg-muted/50" onClick={() => setOpen(!open)}>
                  <TD colSpan={columns.length} className="text-muted-foreground cursor-pointer">
                    {open ? "show fewer" : `show ${hidden} more`}
                  </TD>
                </TR>
              )}
              {/* the height it was asked for, whatever it actually holds. Before the
                    total, so the total is the last row either way */}
              {Array.from({ length: padding }, (_, i) => (
                <TR key={`pad-${i}`} className="border-0 hover:bg-transparent">
                  <TD colSpan={columns.length}>&nbsp;</TD>
                </TR>
              ))}
              {total && (
                // pinned to the floor of the scroller, and sticky stops at its own place,
                // so scrolling to the end puts it back under the last row rather than over it
                <TR
                  className={cn(
                    "font-medium",
                    pinned ? "bg-muted sticky bottom-0 z-10 border-t" : "bg-muted/40",
                  )}
                >
                  {columns.map((col) => (
                    <TD key={col.key} num={col.num} className={cn(pinned && "bg-muted")}>
                      {share(col) ? "" : col.cell ? col.cell(total) : col.get(total)}
                    </TD>
                  ))}
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
