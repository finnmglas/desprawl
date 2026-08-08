// owner: finn
// goal: same numbers as the cli

import type { Node, Split } from "../../src/model.ts"

export const num = (n: number) => n.toLocaleString("en-US")
export const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%")
export const day = (iso: string) => iso.slice(0, 10) || "-"
export const tokens = (chars: number) => Math.round(chars / 4)
export const nest = (s: Split) => (s.code ? (s.indent / s.code).toFixed(1) : "0.0")
export const churn = (n: Node) => n.insertions + n.deletions
