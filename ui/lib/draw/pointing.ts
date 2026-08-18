// owner: finn
// goal: what a cursor or a finger on the drawing means

import { useRef, type RefObject, type MouseEvent, type TouchEvent } from "react"
import { STRIP } from "./paint.ts"
import type { Box, Net, Spot } from "./network.ts"
import type { Held } from "./wires.ts"

// a drag ends in a click event of its own, and opening whatever it ended on is not
// what anybody meant by moving the picture
const SLIP = 3

interface What {
  drawn: Net | null
  board: RefObject<HTMLCanvasElement | null>
  view: RefObject<{ scale: number; x: number; y: number }>
  /** a gesture is under way, so heads and names are skipped until it settles */
  rushed: () => void
  /** the smallest box under a point, as deep into it as the caller wants */
  boxUnder: (px: number, py: number, deep?: number) => Box | null
  /** a module draws no dot, so its box stands for it */
  boxSpot: (px: number, py: number, said?: boolean) => Spot | null
  dotAt: (px: number, py: number) => Spot | null
  lineAt: (px: number, py: number) => (Held & { held: number }) | null
  near: Spot | null
  edge: (Held & { held: number }) | null
  setNear: (spot: Spot | null) => void
  setEdge: (wire: (Held & { held: number }) | null) => void
  /** what a click on each of the three things opens */
  onSpot: (spot: Spot) => void
  onLine: (wire: Held & { held: number }) => void
  onBox: (box: Box | null) => void
}

export function pointing(what: What) {
  const drag = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  // one finger drags, two pinch
  const fingers = useRef<{ x: number; y: number; away: number } | null>(null)
  const { board, view, rushed, dotAt, lineAt, boxSpot, boxUnder, near, edge } = what

  /** the midpoint of whatever is touching, and how far apart two fingers are */
  const touching = (event: TouchEvent) => {
    const box = board.current!.getBoundingClientRect()
    const [a, b] = [event.touches[0], event.touches[1]]
    if (!a) return null
    if (!b) return { x: a.clientX - box.left, y: a.clientY - box.top, away: 0 }
    return {
      x: (a.clientX + b.clientX) / 2 - box.left,
      y: (a.clientY + b.clientY) / 2 - box.top,
      away: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    }
  }

  const inside = (event: MouseEvent) => {
    const box = board.current!.getBoundingClientRect()
    return [event.clientX - box.left, event.clientY - box.top] as const
  }

  return {
    onMouseDown: (event: MouseEvent) => {
      drag.current = { x: event.clientX, y: event.clientY }
      moved.current = false
    },
    onMouseUp: () => {
      drag.current = null
    },
    onMouseLeave: () => {
      drag.current = null
      what.setNear(null)
      what.setEdge(null)
    },
    onTouchStart: (event: TouchEvent) => {
      const now = touching(event)
      fingers.current = now
      moved.current = false
      // a tap has no hover before it
      if (now && event.touches.length === 1) what.setNear(dotAt(now.x, now.y))
    },
    onTouchMove: (event: TouchEvent) => {
      const now = touching(event)
      const was = fingers.current
      fingers.current = now
      if (!now || !was) return
      if (Math.abs(now.x - was.x) + Math.abs(now.y - was.y) > SLIP) moved.current = true
      // the gap is the zoom, the midpoint stays put
      if (now.away && was.away) {
        const next = Math.min(8, Math.max(0.2, (view.current.scale * now.away) / was.away))
        const ratio = next / view.current.scale
        view.current = {
          scale: next,
          x: now.x - (now.x - view.current.x) * ratio,
          y: now.y - (now.y - view.current.y) * ratio,
        }
      }
      view.current.x += now.x - was.x
      view.current.y += now.y - was.y
      rushed()
    },
    onTouchEnd: (event: TouchEvent) => {
      // lifting one of two leaves the other mid gesture, so it starts again
      fingers.current = event.touches.length ? touching(event) : null
    },
    onMouseMove: (event: MouseEvent) => {
      if (drag.current) {
        const dx = event.clientX - drag.current.x
        const dy = event.clientY - drag.current.y
        if (Math.abs(dx) + Math.abs(dy) > SLIP) moved.current = true
        view.current.x += dx
        view.current.y += dy
        drag.current = { x: event.clientX, y: event.clientY }
        return rushed()
      }
      const [px, py] = inside(event)
      // a dot first, since it is the smallest target, then the writing on a module
      // card, then a line, and the rest of that card last: it covers everything under
      // it, every line crossing it included
      const dot = dotAt(px, py)
      const said = dot ? null : boxSpot(px, py, true)
      const line = dot || said ? null : lineAt(px, py)
      const found = dot ?? said ?? (line ? null : boxSpot(px, py))
      if (found?.id !== near?.id) what.setNear(found)
      if (line?.from !== edge?.from || line?.to !== edge?.to) what.setEdge(line ?? null)
    },
    onClick: (event: MouseEvent) => {
      // it moved under the cursor, so the cursor was moving it
      if (moved.current) return
      const [px, py] = inside(event)
      // its name is always the module, whatever sits under the rest of it
      const named = boxUnder(px, py, STRIP)
      const under = named ?? (near || edge ? null : boxUnder(px, py))
      if (under) return what.onBox(under)
      if (near) return what.onSpot(near)
      if (edge) return what.onLine(edge)
      what.onBox(null)
    },
  }
}
