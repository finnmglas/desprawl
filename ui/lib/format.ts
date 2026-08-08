// owner: finn
// goal: same numbers as the cli

import type { Node, Split } from "../../src/model.ts"

export const num = (n: number) => n.toLocaleString("en-US")
export const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%")
export const day = (iso: string) => iso.slice(0, 10) || "-"
export const tokens = (chars: number) => Math.round(chars / 4)
export const nest = (s: Split) => (s.code ? (s.indent / s.code).toFixed(1) : "0.0")
export const churn = (n: Node) => n.insertions + n.deletions

// excel style conditional formatting, a cell against the biggest in its column
export function backdrop(
  value: number,
  peak: number,
  color = "var(--chart-2)",
): React.CSSProperties | undefined {
  if (!peak || !Number.isFinite(value) || value <= 0) return undefined
  const width = Math.min(100, (value / peak) * 100)
  const tint = `color-mix(in oklch, ${color} 22%, transparent)`
  return { backgroundImage: `linear-gradient(to left, ${tint} ${width}%, transparent ${width}%)` }
}

export interface Sort {
  key: string
  asc: boolean
}

// third click clears rather than toggling forever
export const cycle = (sort: Sort | null, key: string): Sort | null =>
  sort?.key !== key ? { key, asc: false } : sort.asc ? null : { key, asc: true }
