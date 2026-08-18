// owner: finn
// goal: where a line runs, and whether the cursor is on it

import type { Net, Spot, Wire } from "./network.ts"

/** a wire as drawn: several may be bundled into one, and it says how many */
export interface Held extends Wire {
  held: number
}

/** where an end of a wire sits: a dot, or the middle of the box standing for it */
export type Seat = (id: string) => { x: number; y: number; r: number } | null

export const seating =
  (
    at: Map<string, Spot>,
    boxes: Map<string, { x: number; y: number; w: number; h: number }>,
  ): Seat =>
  (id) => {
    const spot = at.get(id)
    if (spot) return { x: spot.x, y: spot.y, r: spot.r }
    const box = boxes.get(id)
    return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2, r: 0 } : null
  }

/** one line per pair of modules, since at this size the lines are the noise */
export function bundled(wires: Wire[], unitOf: (id: string) => string): Held[] {
  const found = new Map<string, Held>()
  for (const wire of wires) {
    const a = unitOf(wire.from)
    const b = unitOf(wire.to)
    const key = a === b ? `${wire.from} ${wire.to}` : `${a} ${b}`
    const one = found.get(key) ?? {
      from: a === b ? wire.from : a,
      to: a === b ? wire.to : b,
      imports: 0,
      calls: 0,
      http: 0,
      types: true,
      held: 0,
    }
    one.imports += wire.imports
    one.calls += wire.calls
    one.http += wire.http
    one.held++
    if (!wire.types) one.types = false
    found.set(key, one)
  }
  return [...found.values()]
}

/** its two ends, and the point its bow bends around */
export function runs(wire: Wire, bow: number, seat: Seat) {
  const from = seat(wire.from)
  const to = seat(wire.to)
  if (!from || !to) return null
  const dx = to.x - from.x
  const dy = to.y - from.y
  const long = Math.hypot(dx, dy) || 1
  const lift = Math.min(26, long / 7) * bow
  return {
    from,
    to,
    cx: (from.x + to.x) / 2 - (dy / long) * lift,
    cy: (from.y + to.y) / 2 + (dx / long) * lift,
  }
}

/** the point a quadratic has reached at t */
const along = (
  from: { x: number; y: number },
  cx: number,
  cy: number,
  to: { x: number; y: number },
  at: number,
) => ({
  x: (1 - at) ** 2 * from.x + 2 * (1 - at) * at * cx + at ** 2 * to.x,
  y: (1 - at) ** 2 * from.y + 2 * (1 - at) * at * cy + at ** 2 * to.y,
})

// in screen pixels: wide in the middle of a line, narrow at its ends, where a node is
// what the cursor is aiming at and the line only passes through
const WIDE = 14
const TIP = 4

/** the wire under the cursor, whichever of its kinds is drawn, or none */
export function wireAt(
  shown: Held[],
  seat: Seat,
  bows: [unknown, number][],
  scale: number,
  gx: number,
  gy: number,
): Held | null {
  const reach = (at: number) => (TIP + (WIDE - TIP) * Math.sin(Math.PI * at)) / scale
  const most = WIDE / scale
  let best: Held | null = null
  // scored, not measured: the middle of a line beats the end of another one nearby
  let closest = 0
  for (const wire of shown)
    for (const [on, bow] of bows) {
      if (!on) continue
      const held = runs(wire, bow, seat)
      if (!held) continue
      const { from, to, cx, cy } = held
      // the box a curve lives in, cheap enough to skip most of them on
      if (
        gx < Math.min(from.x, to.x, cx) - most ||
        gx > Math.max(from.x, to.x, cx) + most ||
        gy < Math.min(from.y, to.y, cy) - most ||
        gy > Math.max(from.y, to.y, cy) + most
      )
        continue
      // a point every twenty pixels or so, and the line between two of them counts, or
      // only the handful of sampled points on a long curve can be hit at all
      const long = Math.hypot(to.x - from.x, to.y - from.y) * scale
      const steps = Math.max(8, Math.min(64, Math.round(long / 20)))
      let last = along(from, cx, cy, to, 0)
      for (let i = 1; i <= steps; i++) {
        const next = along(from, cx, cy, to, i / steps)
        const dx = next.x - last.x
        const dy = next.y - last.y
        const span = dx * dx + dy * dy
        // where on this piece of the line the cursor is, clamped to its ends
        const at = span
          ? Math.max(0, Math.min(1, ((gx - last.x) * dx + (gy - last.y) * dy) / span))
          : 0
        const away = Math.hypot(last.x + at * dx - gx, last.y + at * dy - gy)
        // 1 where the cursor sits on the line, 0 where it is as far as this piece allows
        const score = 1 - away / reach((i - 1 + at) / steps)
        if (score > closest) {
          closest = score
          best = wire
        }
        last = next
      }
    }
  return best
}

/** the dot under the cursor, and only a dot: a module box is a target of its own */
export function spotAt(drawn: Net, scale: number, gx: number, gy: number): Spot | null {
  let best: Spot | null = null
  // its own size and a little around it, since a wider claim than that leaves a line
  // nowhere to be hovered at all
  let close = 8 / scale
  for (const spot of drawn.spots) {
    const away = Math.hypot(spot.x - gx, spot.y - gy)
    if (away < close + spot.r) {
      close = away
      best = spot
    }
  }
  return best
}
