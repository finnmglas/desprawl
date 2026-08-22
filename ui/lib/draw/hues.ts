// owner: finn
// goal: what colour a node takes, and what the colours meant

import { BRANDS } from "./brands.ts"
import { LANGS } from "../../../src/read/langs.ts"
import { hued } from "./paint.ts"
import { shapeOf } from "../text/verdict.ts"
import type { Box, Grain, Net, Spot } from "./network.ts"
import type { Graph } from "../../../src/read/graph.ts"
import type { Unit } from "../../../src/read/layers.ts"

// green to red: bloated against its neighbours, not in the abstract
const ramp = (share: number) => `hsl(${Math.round(140 - 140 * share)}, 65%, 55%)`

/** a band, spread across the wheel: an ordered thing wants ordered colours */
const banded = (at: number, of: number) =>
  `hsl(${Math.round((at / Math.max(1, of)) * 300)}, 62%, 55%)`

export const langOf = (file: string) => LANGS[file.split(".").pop()?.toLowerCase() ?? ""] ?? ""

export interface Painting {
  painted: string
  grain: Grain
  graph: Graph | null
  units: Map<string, Unit>
  called: Map<string, string>
  boxAt: Map<string, Box>
  /** the deepest level and the largest node, which the ramps are read against */
  deepest: number
  biggest: number
}

/** what a file is for, which is the only kind a file has */
const sortOf = (graph: Graph | null, file: string) =>
  graph?.modules[file]?.barrel
    ? "barrel"
    : /(^|\/)(tests?|__tests__)\/|\.(test|spec)\./.test(file)
      ? "test"
      : "source"

const unitOf = (what: Painting, spot: Spot) =>
  what.grain === "declaration" ? (what.boxAt.get(spot.box)?.parent ?? spot.box) : spot.box

/** the unit a colour is read off: a module is its own, anything else belongs to one */
const owning = (what: Painting, spot: Spot) =>
  what.units.get(what.grain === "module" ? spot.id : unitOf(what, spot))

const shapeAt = (what: Painting, spot: Spot) => {
  const unit = owning(what, spot)
  if (!unit) return null
  const out = Object.values(unit.out).reduce((sum, n) => sum + n, 0)
  const into = Object.values(unit.in).reduce((sum, n) => sum + n, 0)
  return shapeOf(unit.internal, out, into, Object.keys(unit.out).length).label
}

export const colouring = (what: Painting) => (spot: Spot) => {
  const { painted, grain, graph } = what
  if (painted === "one colour") return null
  if (painted === "language") {
    const brand = BRANDS[langOf(grain === "declaration" ? spot.box : spot.id)]
    return brand ? `#${brand[0]}` : null
  }
  if (painted === "kind") return hued(grain === "file" ? sortOf(graph, spot.id) : spot.kind)
  if (painted === "size") return ramp(Math.log1p(spot.weight) / what.biggest)
  if (painted === "shape") {
    const label = shapeAt(what, spot)
    return label ? hued(label) : null
  }
  if (painted === "level") return banded(owning(what, spot)?.level ?? 0, what.deepest)
  return hued(grain === "module" ? spot.id : unitOf(what, spot))
}

/** every colour on screen, once, in the order the eye meets them */
export const legendOf = (what: Painting, drawn: Net | null) => {
  const { painted, grain, graph, called } = what
  if (!drawn || painted === "one colour") return []
  // size is a ramp, not a set of names, so it says its two ends instead
  if (painted === "size")
    return [
      { label: "smaller", colour: ramp(0) },
      { label: "bigger", colour: ramp(1) },
    ]
  const colourOf = colouring(what)
  const seen = new Map<string, string | null>()
  for (const spot of drawn.spots) {
    const label =
      painted === "language"
        ? langOf(grain === "declaration" ? spot.box : spot.id)
        : painted === "kind"
          ? grain === "file"
            ? sortOf(graph, spot.id)
            : spot.kind
          : painted === "level"
            ? `L${owning(what, spot)?.level ?? 0}`
            : painted === "module"
              ? (called.get(grain === "module" ? spot.id : unitOf(what, spot)) ?? "")
              : painted === "shape"
                ? (shapeAt(what, spot) ?? "")
                : ""
    if (!label || seen.has(label)) continue
    seen.set(label, colourOf(spot))
  }
  return [...seen].slice(0, 14).map(([label, colour]) => ({ label, colour }))
}
