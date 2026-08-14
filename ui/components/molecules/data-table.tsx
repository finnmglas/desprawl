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
import { useDisplay } from "../../lib/display.tsx"
import type { Sort } from "../../lib/format.ts"
import { cn } from "../../lib/ui.ts"

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
  /** Rows shown, the rest behind a toggle */
  fold?: number
  /** the order the reader chose, for anything drawing the same rows elsewhere */
  onSort?: (sort: Sort | null) => void
  /** what an export is called, when the title is not plain words */
  file?: string
  /** more tables that come off this panel, offered inside its save button */
  saves?: Sheet[]
  /** what the reader typed into the search, for a total row that has to agree with it */
  onFind?: (said: string) => void
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
  fold,
  file,
  saves,
  onSort,
  onFind,
  mark,
}: DataTableProps<T>) {
  const { scale, curve } = useDisplay()
  const sheet = useRef<HTMLDivElement>(null)
  const spot = useRef<HTMLTableRowElement>(null)
  const [sort, setSort] = useState<Sort | null>(null)
  const [open, setOpen] = useState(false)
  const [hunt, setHunt] = useState("")

  // a table nobody has to scroll is a table nobody searches, so the search appears with
  // the fold that hid something in the first place
  const searchable = fold !== undefined && rows.length > fold
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
  const foldable = fold !== undefined && sorted.length > fold
  const shown = foldable && !open ? sorted.slice(0, fold) : sorted
  const hidden = foldable ? sorted.length - fold : 0

  const marked = mark ? sorted.find(mark) : undefined
  const at = marked ? id(marked) : ""
  useEffect(() => {
    if (!marked) return
    // a marked row behind the fold is a row nobody sees, so the fold gives way to it
    if (!shown.includes(marked)) return setOpen(true)
    spot.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [at, open])

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
          <Table>
            <THead>
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
              {shown.map((row) => (
                <TR
                  key={id(row)}
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
              {foldable && (
                <TR className="hover:bg-muted/50" onClick={() => setOpen(!open)}>
                  <TD colSpan={columns.length} className="text-muted-foreground cursor-pointer">
                    {open ? "show fewer" : `show ${hidden} more`}
                  </TD>
                </TR>
              )}
              {total && (
                <TR className="bg-muted/40 font-medium">
                  {columns.map((col) => (
                    <TD key={col.key} num={col.num}>
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
