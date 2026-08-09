// owner: finn
// goal: what a number in a table cell means under the chosen scale

import type { Scale } from "./display.tsx"

/** the part of a column that scaling reads, so tables and tests share one rule */
export interface Scaled<T> {
  key: string
  num?: boolean
  get: (row: T) => string | number
  /** row relative denominator, columns without one stay absolute */
  ofRow?: (row: T) => number
}

/** The two scales that turn a count into a share, named rather than negated */
export const shares = <T>(col: Scaled<T>, scale: Scale): boolean =>
  !!col.num && (scale === "repo" || (scale === "row" && !!col.ofRow))

/** What the cell means now. Sorting and the backdrop bars read the same value */
export function effective<T>(
  col: Scaled<T>,
  row: T,
  scale: Scale,
  sums: Record<string, number>,
): number | string {
  const value = col.get(row)
  if (typeof value !== "number" || !shares(col, scale)) return value
  const over = scale === "repo" ? (sums[col.key] ?? 0) : (col.ofRow?.(row) ?? 0)
  return over ? value / over : 0
}
