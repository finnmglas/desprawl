// owner: finn
// goal: number modes

import { createContext, useContext } from "react"

/** simple abbreviates, abs shows counts, repo divides by the column total, row by the row's own lines. */
export type Scale = "simple" | "abs" | "repo" | "row"
export type Curve = "linear" | "log"

export const SCALES: Scale[] = ["simple", "abs", "repo", "row"]
export const CURVES: Curve[] = ["linear", "log"]

export const EXPLAIN: Record<Scale, string> = {
  simple: "short forms like 3.3m and 1.5k",
  abs: "counts as they are",
  repo: "share of the column total",
  row: "share of the row's own lines",
}

export interface Display {
  scale: Scale
  curve: Curve
}

const Ctx = createContext<Display>({ scale: "simple", curve: "linear" })

export const DisplayProvider = Ctx.Provider
export const useDisplay = (): Display => useContext(Ctx)
