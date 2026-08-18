// owner: finn
// goal: what sits under a point on the drawing

import { spotAt, wireAt, type Held, type Seat } from "./wires.ts"
import type { Box, Grain, Net, Spot } from "./network.ts"

// the writing on a module card, which is where a reader aims for the card itself
const SAYS = 34

interface What {
  drawn: Net | null
  grain: Grain
  view: { current: { scale: number; x: number; y: number } }
  /** the wires as they are drawn, which is what a cursor can land on */
  shown: Held[]
  sits: Seat
  bows: () => [unknown, number][]
}

export function hitting({ drawn, grain, view, shown, sits, bows }: What) {
  /** what is under the cursor, asked in the pixels the cursor is given in */
  const inPicture = (px: number, py: number) => {
    const { scale, x, y } = view.current
    return { scale, gx: (px - x) / scale, gy: (py - y) / scale }
  }

  /** the smallest box under the cursor, down to as far into it as the caller wants */
  const boxUnder = (px: number, py: number, deep?: number): Box | null => {
    if (!drawn) return null
    const { scale, gx, gy } = inPicture(px, py)
    const room = deep === undefined ? Infinity : deep / scale
    return (
      drawn.boxes
        .filter(
          (b) =>
            b.depth === 1 &&
            gx >= b.x &&
            gx <= b.x + b.w &&
            gy >= b.y &&
            gy <= b.y + Math.min(b.h, room),
        )
        .sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null
    )
  }

  const dotAt = (px: number, py: number): Spot | null => {
    if (!drawn) return null
    const { scale, gx, gy } = inPicture(px, py)
    return spotAt(drawn, scale, gx, gy)
  }

  const lineAt = (px: number, py: number) => {
    if (!drawn) return null
    const { scale, gx, gy } = inPicture(px, py)
    return wireAt(shown, sits, bows(), scale, gx, gy)
  }

  /** a module draws no dot, so its box stands for it: by its writing, or anywhere in it */
  const boxSpot = (px: number, py: number, said = false): Spot | null => {
    if (!drawn || grain !== "module") return null
    const box = boxUnder(px, py, said ? SAYS : undefined)
    return box ? (drawn.spots.find((one) => one.id === box.id) ?? null) : null
  }

  return { boxUnder, dotAt, lineAt, boxSpot }
}
