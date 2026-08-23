// owner: finn
// goal: dragging a thing and everything it holds, without letting it out of what holds it

import type { Box, Net, Spot } from "./network.ts"

/** the top of a card is its own writing, which is where the dots inside it start */
const HEAD = 12

export interface Grab {
  /** every dot that moves with it, the handle's own included */
  spots: Spot[]
  boxes: Box[]
  /** what it may not be dragged out of, when the thing holding it has walls */
  wall: { x: number; y: number; w: number; h: number } | null
  /** the handle, a dot or a card, whose own footprint the wall is measured against */
  hold: Spot | Box
}

/** what the wall has to hold: a card is its own box, a dot is the circle it draws */
const foot = (hold: Spot | Box) =>
  "w" in hold
    ? { x: hold.x, y: hold.y, w: hold.w, h: hold.h }
    : { x: hold.x - hold.r, y: hold.y - hold.r, w: hold.r * 2, h: hold.r * 2 }

const walls = (box: Box) => ({
  x: box.x,
  y: box.y + (box.depth > 0 ? HEAD : 0),
  w: box.w,
  h: box.h - (box.depth > 0 ? HEAD : 0),
})

/** the boxes holding this one, outermost last */
function over(boxes: Map<string, Box>, id: string): Box[] {
  const out: Box[] = []
  for (let at = boxes.get(id)?.parent ?? ""; at; at = boxes.get(at)?.parent ?? "") {
    const box = boxes.get(at)
    if (!box) break
    out.push(box)
  }
  return out
}

/** what a drag on this thing takes with it, and the walls it stays inside */
export function grabbing(drawn: Net, target: { spot?: Spot; box?: Box }): Grab | null {
  const boxes = new Map(drawn.boxes.map((one) => [one.id, one]))
  // a module draws no dot of its own: dragging what stands for it drags the card
  const box = target.box ?? (target.spot && !target.spot.box ? boxes.get(target.spot.id) : null)

  if (!box) {
    const spot = target.spot
    if (!spot) return null
    const home = boxes.get(spot.box)
    return {
      spots: [spot],
      boxes: [],
      wall: home ? walls(home) : null,
      hold: spot,
    }
  }

  // a lane is a repo and a card is a module, so a card stays in the repo it belongs to
  const held = [box, ...drawn.boxes.filter((one) => over(boxes, one.id).includes(box))]
  const ids = new Set(held.map((one) => one.id))
  const lane = over(boxes, box.id).find((one) => one.depth < 0)
  return {
    spots: drawn.spots.filter((one) => ids.has(one.box) || ids.has(one.id)),
    boxes: held,
    wall: box.depth < 0 ? null : (lane ?? null),
    hold: box,
  }
}

/** move it, and everything under it by the same step, so the arrangement inside it holds */
export function shift(grab: Grab, dx: number, dy: number): void {
  const { wall } = grab
  if (wall) {
    // measured where it is now, since a drag asks this of every step
    const one = foot(grab.hold)
    dx = Math.min(Math.max(dx, wall.x - one.x), wall.x + wall.w - (one.x + one.w))
    dy = Math.min(Math.max(dy, wall.y - one.y), wall.y + wall.h - (one.y + one.h))
  }
  for (const spot of grab.spots) {
    spot.x += dx
    spot.y += dy
  }
  for (const box of grab.boxes) {
    box.x += dx
    box.y += dy
  }
}
