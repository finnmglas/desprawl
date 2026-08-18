// owner: finn
// goal: the architecture card, said as text

import { human } from "./human.ts"
import { shapeOf } from "../read/shapes.ts"
import { namesOf } from "../read/naming.ts"
import type { Unit } from "../read/layers.ts"
import type { Stack } from "../read/model.ts"

const num = (v: number) => human(v, 3)

export const BANDS = [
  {
    key: "entry",
    label: "Consumable Entrypoints",
    hint: "almost nothing imports it, and it imports the rest, so it wires things together",
  },
  {
    key: "middle",
    label: "Middle Abstractions",
    hint: "neither a module nor a composition layer, which is what makes it hard to move",
  },
  {
    key: "base",
    label: "Core Fundaments",
    hint: "more imports arrive than leave, so the rest is built on top of it",
  },
] as const

/** the same picture as text, since a band and its groups is what anyone would paste */
export function wall(name: string, units: Unit[], stack: Stack): string {
  const edges = (side: Record<string, number>) => Object.values(side).reduce((sum, n) => sum + n, 0)
  const called = namesOf(units)
  const out: string[] = [name, ...(stack.frameworks.length ? [stack.frameworks.join(", ")] : [])]
  for (const band of BANDS) {
    const held = units
      .filter(
        (u) =>
          shapeOf(u.internal, edges(u.out), edges(u.in), Object.keys(u.out).length).band ===
          band.key,
      )
      .sort((a, b) => b.level - a.level || b.lines - a.lines)
    if (!held.length) continue
    out.push(`\n${band.label}`)
    for (const u of held) {
      const shape = shapeOf(u.internal, edges(u.out), edges(u.in), Object.keys(u.out).length)
      out.push(
        `  ${called.get(u.path)} (${u.path}) L${u.level} ${shape.sure ? "" : "~"}${shape.label}, ${num(u.lines)} lines`,
      )
    }
  }
  const outside = [...new Set([...stack.hosts, ...stack.apis, ...stack.connects])]
  if (outside.length) out.push(`\nOutside it: ${outside.join(", ")}`)
  return out.join("\n")
}
