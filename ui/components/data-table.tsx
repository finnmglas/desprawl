// owner: finn
// goal: one column spec drives render, sort and export

import { useMemo, useState } from "react"
import { Button } from "./button.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./card.tsx"
import { CopyButton } from "./copy-button.tsx"
import { TBody, TD, TH, THead, TR, Table } from "./table.tsx"
import { Tip } from "./tip.tsx"
import { toast } from "./toast.tsx"
import { delimit, download } from "../lib/export.ts"
import { HINTS } from "../lib/hints.ts"
import { backdrop, cycle, pct } from "../lib/format.ts"
import { effective, shares } from "../lib/scale.ts"
import { useDisplay } from "../lib/display.tsx"
import type { Sort } from "../lib/format.ts"
import { cn } from "../lib/ui.ts"

export interface Column<T> {
  key: string
  label: string
  num?: boolean
  /** Exported and sorted value. */
  get: (row: T) => string | number
  /** Render override, defaults to get(). */
  cell?: (row: T) => React.ReactNode
  /** Suppress backdrop bar on numeric column */
  flat?: boolean
  /** Row relative denominator, columns without one stay absolute */
  ofRow?: (row: T) => number
  /** Shown on hover, overriding the shared note for this label */
  hint?: string
}

export interface DataTableProps<T> {
  title: string
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
}: DataTableProps<T>) {
  const { scale, curve } = useDisplay()
  const [sort, setSort] = useState<Sort | null>(null)
  const [open, setOpen] = useState(false)

  const sums = useMemo(() => {
    const found: Record<string, number> = {}
    for (const col of columns) {
      if (!col.num) continue
      let sum = 0
      for (const row of rows) {
        const value = col.get(row)
        if (typeof value === "number") sum += value
      }
      found[col.key] = sum
    }
    return found
  }, [columns, rows])

  const share = (col: Column<T>) => shares(col, scale)
  const scaled = (col: Column<T>, row: T) => effective(col, row, scale, sums)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    return [...rows].sort((a, b) => {
      const [x, y] = [scaled(col, a), scaled(col, b)]
      const cmp =
        typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))
      return sort.asc ? cmp : -cmp
    })
  }, [rows, sort, columns, scale])

  // peaks follow the same values, shares bar against the biggest share
  const peaks = useMemo(() => {
    const found: Record<string, number> = {}
    for (const col of columns) {
      if (!col.num || col.flat) continue
      let peak = 0
      for (const row of rows) {
        const at = scaled(col, row)
        if (typeof at === "number" && at > peak) peak = at
      }
      found[col.key] = peak
    }
    return found
  }, [columns, rows, scale])

  // the fold hides rows, peaks and export still see them all
  const foldable = fold !== undefined && sorted.length > fold
  const shown = foldable && !open ? sorted.slice(0, fold) : sorted
  const hidden = foldable ? sorted.length - fold : 0

  const matrix = () => [
    columns.map((c) => c.label),
    ...sorted.map((row) => columns.map((c) => scaled(c, row))),
  ]
  const slug = title.toLowerCase().replace(/\W+/g, "-")

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle>{title}</CardTitle>
          {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {children}
          <CopyButton
            text={() => delimit(matrix(), "\t")}
            message={`Copied ${sorted.length} rows`}
            note="Paste straight into a sheet"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              download(`${slug}.csv`, delimit(matrix(), ","))
              toast(`${slug}.csv`, `${sorted.length} rows`)
            }}
          >
            csv
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        <Table>
          <THead>
            <TR>
              {columns.map((col) => (
                <TH
                  key={col.key}
                  num={col.num}
                  onClick={() => setSort(cycle(sort, col.key))}
                  className="hover:text-foreground cursor-pointer select-none"
                >
                  <Tip text={col.hint ?? HINTS[col.label]} side="bottom">
                    <span>
                      {col.label}
                      {sort?.key === col.key && (sort.asc ? " ↑" : " ↓")}
                    </span>
                  </Tip>
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {shown.map((row) => (
              <TR
                key={id(row)}
                onClick={() => onRowClick?.(row)}
                style={rowStyle?.(row)}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => {
                  const cell = scaled(col, row)
                  return (
                    <TD
                      key={col.key}
                      num={col.num}
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
      </CardContent>
    </Card>
  )
}
