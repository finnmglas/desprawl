// owner: finn
// goal: number modes

import { createContext, useContext } from "react"
import type { Curve } from "../say/format.ts"

/** simple abbreviates, repo divides by the column total, row by the row's own lines */
export type Scale = "simple" | "abs" | "repo" | "row"
export type { Curve }

export const SCALES: Scale[] = ["simple", "abs", "repo", "row"]
export const CURVES: Curve[] = ["linear", "log"]

export const EXPLAIN: Record<Scale, string> = {
  simple: "short forms like 3.3m and 1.5k",
  abs: "counts as they are",
  repo: "share of the column total",
  row: "share of the row's own lines",
}

export type Brands = "focus" | "flashy" | "off"
export const BRANDINGS: Brands[] = ["focus", "flashy", "off"]

/** what a kpi holds its number against: a rolling window, or the year so far */
export type Compare = "none" | "24h" | "7d" | "mo" | "yr" | "ytd"
export const COMPARES: Compare[] = ["none", "24h", "7d", "mo", "yr", "ytd"]

export const SINCE: Record<Compare, string> = {
  none: "the number on its own",
  "24h": "against a day ago",
  "7d": "against a week ago",
  mo: "against thirty days ago",
  yr: "against a year ago, rolling",
  ytd: "since the first of january",
}

export type Shown = "5" | "10" | "virtual" | "all"
export const SHOWN: Shown[] = ["5", "10", "virtual", "all"]

/** rows tall */
export const HOLDS: Record<Shown, number> = { "5": 5, "10": 10, virtual: 10, all: 0 }

export interface Display {
  scale: Scale
  curve: Curve
  brands: Brands
  rows: Shown
  compare: Compare
}

const Ctx = createContext<Display>({
  scale: "simple",
  curve: "linear",
  brands: "focus",
  rows: "virtual",
  compare: "24h",
})

export const DisplayProvider = Ctx.Provider
export const useDisplay = (): Display => useContext(Ctx)
