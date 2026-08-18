// owner: finn
// goal: one definition of the per node metrics, shared by every table that shows them

import { churn, day, nest, num, tokens } from "./format.ts"
import type { Node } from "../../../src/read/model.ts"

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
  /** keep it left, even when the values are numbers the table would right align */
  left?: boolean
  /** a column where all zeros is the good answer, so it is never flagged as unread */
  good?: boolean
  behind?: boolean // cell positions a drawing
  width?: number // pixels, not read off content
}

/**
 * a table as a file: the header, then what each row holds. Never what a display setting
 * is making of it, since a share of a total and a count under the same heading is a file
 * nobody can read back
 */
export const asMatrix = <T>(columns: Column<T>[], rows: T[]): (string | number)[][] => [
  columns.map((one) => one.label),
  ...rows.map((row) => columns.map((one) => one.get(row))),
]

/** a row's own lines, the denominator when reading shares within a row */
export const lines = (n: Node) => n.code + n.comment + n.blank

// prettier-ignore
export const METRICS: Column<Node>[] = [
  { key: "code", label: "loc", num: true, get: (n) => n.code, cell: (n) => num(n.code), ofRow: lines },
  { key: "comment", label: "comment", num: true, get: (n) => n.comment, cell: (n) => num(n.comment), ofRow: lines },
  { key: "blank", label: "blank", num: true, get: (n) => n.blank, cell: (n) => num(n.blank), ofRow: lines },
  { key: "files", label: "files", num: true, get: (n) => n.files, cell: (n) => num(n.files) },
  { key: "chars", label: "chars", num: true, get: (n) => n.chars, cell: (n) => num(n.chars) },
  { key: "tok", label: "~tok", num: true, get: (n) => tokens(n.chars), cell: (n) => num(tokens(n.chars)) },
  { key: "nest", label: "nest", num: true, get: (n) => Number(nest(n)) },
  { key: "commits", label: "com", num: true, get: (n) => n.commits, cell: (n) => num(n.commits) },
  { key: "churn", label: "churn", num: true, get: (n) => churn(n), cell: (n) => num(churn(n)) },
  { key: "last", label: "last", num: true, get: (n) => n.last, cell: (n) => day(n.last), flat: true },
]

/** the metrics with one inserted after loc, which is where a share column belongs */
export const withShare = (share: Column<Node>): Column<Node>[] => [
  METRICS[0],
  share,
  ...METRICS.slice(1),
]
