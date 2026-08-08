// owner: finn
// goal: one column spec drives render, sort and export

import { useMemo, useState } from "react"
import { Button } from "./button.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./card.tsx"
import { TBody, TD, TH, THead, TR, Table } from "./table.tsx"
import { toast } from "./toast.tsx"
import { copy, delimit, download } from "../lib/export.ts"
import { backdrop, cycle } from "../lib/format.ts"
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
}: DataTableProps<T>) {
  const [sort, setSort] = useState<Sort | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    return [...rows].sort((a, b) => {
      const [x, y] = [col.get(a), col.get(b)]
      const cmp =
        typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))
      return sort.asc ? cmp : -cmp
    })
  }, [rows, sort, columns])

  const peaks = useMemo(() => {
    const found: Record<string, number> = {}
    for (const col of columns) {
      if (!col.num || col.flat) continue
      let peak = 0
      for (const row of rows) {
        const value = col.get(row)
        if (typeof value === "number" && value > peak) peak = value
      }
      found[col.key] = peak
    }
    return found
  }, [columns, rows])

  const matrix = () => [
    columns.map((c) => c.label),
    ...sorted.map((row) => columns.map((c) => c.get(row))),
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
          <Button
            variant="ghost"
            size="sm"
            onClick={async () =>
              toast(
                (await copy(delimit(matrix(), "\t")))
                  ? `Copied ${sorted.length} rows`
                  : "Copy blocked by the browser",
                "Paste straight into a sheet",
              )
            }
          >
            copy
          </Button>
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
                  {col.label}
                  {sort?.key === col.key && (sort.asc ? " ↑" : " ↓")}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {sorted.map((row) => (
              <TR
                key={id(row)}
                onClick={() => onRowClick?.(row)}
                style={rowStyle?.(row)}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => {
                  const value = col.get(row)
                  return (
                    <TD
                      key={col.key}
                      num={col.num}
                      style={
                        typeof value === "number" ? backdrop(value, peaks[col.key]) : undefined
                      }
                    >
                      {col.cell ? col.cell(row) : value}
                    </TD>
                  )
                })}
              </TR>
            ))}
            {total && (
              <TR className="bg-muted/40 font-medium">
                {columns.map((col) => (
                  <TD key={col.key} num={col.num}>
                    {col.cell ? col.cell(total) : col.get(total)}
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
