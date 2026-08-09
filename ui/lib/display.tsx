// owner: finn
// goal: number modes

import { createContext, useContext } from "react"

/** simple abbreviates, repo divides by the column total, row by the row's own lines */
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

export type Brands = "focus" | "flashy" | "off"
export const BRANDINGS: Brands[] = ["focus", "flashy", "off"]

export interface Display {
  scale: Scale
  curve: Curve
  brands: Brands
}

const Ctx = createContext<Display>({ scale: "simple", curve: "linear", brands: "focus" })

export const DisplayProvider = Ctx.Provider
export const useDisplay = (): Display => useContext(Ctx)
