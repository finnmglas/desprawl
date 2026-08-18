// owner: finn
// goal: one column spec drives render, sort and export

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { CopyButton } from "../copy-button.tsx"
import { Save, type Sheet } from "../save.tsx"
import { TBody, TD, TH, THead, TR, Table } from "../../atoms/table.tsx"
import { Tip } from "../../atoms/tip.tsx"
import { type Column } from "../../../lib/say/columns.ts"
import { Find } from "../find.tsx"
import {} from "../../../lib/app/export.ts"
import { asMatrix } from "../../../lib/say/columns.ts"
import { delimited } from "../../../lib/say/formats.ts"
import { HINTS } from "../../../lib/say/hints.ts"
import { backdrop, cycle, pct } from "../../../lib/say/format.ts"
import { effective, shares } from "../../../lib/draw/scale.ts"
import { HOLDS, useDisplay } from "../../../lib/app/display.tsx"
import { useWindowing } from "../../../lib/app/windowing.ts"
import type { Sort } from "../../../lib/say/format.ts"
import { cn } from "../../../lib/app/ui.ts"

export type { Column }

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
  /** for a total row that has to agree with the search */
  onFind?: (said: string) => void
  onEnd?: () => void // scrolled to the end
  /** marked, unfolded and scrolled to */
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
  const pinned = shown_ === "virtual"
  const sheet = useRef<HTMLDivElement>(null)
  const spot = useRef<HTMLTableRowElement>(null)
  const [sort, setSort] = useState<Sort | null>(null)
  const [open, setOpen] = useState(false)
  const [hunt, setHunt] = useState("")
  const scroller = useRef<HTMLDivElement>(null)

  // a table nobody has to scroll is a table nobody searches
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

  // num means right aligned, not that it holds numbers
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
  // never shorter than the height it was asked for
  const padding = Math.max(0, holds - shown.length)

  const { unit, tall, widths, windowed, measured, first, last, slice, scrollTo } = useWindowing({
    pinned,
    holds: HOLDS.virtual,
    sheet,
    scroller,
    sorted,
    shown,
    columns,
    open,
    rows,
    onEnd,
    keyed: [hunt, sort?.key, sort?.asc, rows.length],
  })

  const marked = mark ? sorted.find(mark) : undefined
  const at = marked ? id(marked) : ""
  useEffect(() => {
    if (!marked) return
    // a marked row behind the fold is a row nobody sees
    if (!shown.includes(marked)) return setOpen(true)
    if (windowed) return scrollTo(shown.indexOf(marked))
    spot.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [at, open, windowed])

  const matrix = () => asMatrix(columns, sorted)
  // a title can carry a mark, so the file name is its words
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
            text={() => delimited(matrix(), "\t")}
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
              {measured && first > 0 && (
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
              {measured && last < shown.length && (
                <tr aria-hidden style={{ height: Math.round((shown.length - last) * unit) }} />
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
                // sticky stops at its own place
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
