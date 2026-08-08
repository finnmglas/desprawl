// owner: finn
// goal: number modes

import { createContext, useContext } from "react"

/** abs shows counts, repo divides by the column total, row divides by the row's own lines. */
export type Scale = "abs" | "repo" | "row"
export type Curve = "linear" | "log"

export const SCALES: Scale[] = ["abs", "repo", "row"]
export const CURVES: Curve[] = ["linear", "log"]

export interface Display {
  scale: Scale
  curve: Curve
}

const Ctx = createContext<Display>({ scale: "abs", curve: "linear" })

export const DisplayProvider = Ctx.Provider
export const useDisplay = (): Display => useContext(Ctx)
