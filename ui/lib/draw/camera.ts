// owner: finn
// goal: where the picture is looked at from, and when it is redrawn

import { useEffect, useRef, type RefObject } from "react"
import { keep, recall } from "../app/kept.ts"
import type { Box, Grain, Net } from "./network.ts"

export interface Seat {
  x: number
  y: number
}
export interface Frame extends Seat {
  w: number
  h: number
}

interface What {
  drawn: Net | null
  board: RefObject<HTMLCanvasElement | null>
  /** the room the picture is drawn in, already less its padding */
  room: number
  tall: number
  moves: boolean
  only: string
  grain: Grain
  /** a fresh drawing, so whatever the cursor was on is gone */
  fresh: () => void
}

export function useCamera({ drawn, board, room, tall, moves, only, grain, fresh }: What) {
  const view = useRef(
    recall<{ scale: number; x: number; y: number }>("net.camera") ?? { scale: 1, x: 0, y: 0 },
  )
  // drawing is not a render
  const drawing = useRef<() => void>(() => {})
  const queued = useRef(0)
  const schedule = () => {
    if (queued.current) return
    queued.current = requestAnimationFrame(() => {
      queued.current = 0
      drawing.current()
    })
  }
  // heads and names are skipped mid gesture and come back after
  const busy = useRef(0)
  const rushed = () => {
    busy.current = performance.now() + 140
    touched.current = true
    schedule()
  }
  const seats = useRef(new Map<string, Seat>())
  // and where every box was, since a module is drawn as one and a jump is what a reader
  // cannot follow: an arriving api graph reorders them under the cursor
  const frames = useRef(new Map<string, Frame>())
  // whether the camera is where the reader put it, or still where it was opened
  const touched = useRef(recall<boolean>("net.touched") ?? false)
  const framed = useRef(recall<{ w: number; h: number }>("net.framed") ?? { w: 0, h: 0 })
  const moving = useRef<{
    from: Map<string, Seat>
    boxes: Map<string, Frame>
    at: number
  } | null>(null)

  // written on the way out
  useEffect(
    () => () => {
      keep("net.camera", view.current)
      keep("net.touched", touched.current)
      keep("net.framed", framed.current)
    },
    [],
  )

  // a fresh picture opens whole: hunting for it loses the shape
  const whole = () => {
    const scale = drawn
      ? Math.min(1.6, room / Math.max(1, drawn.width), tall / Math.max(1, drawn.height))
      : 1
    view.current = {
      scale,
      x: (room - (drawn?.width ?? 0) * scale) / 2,
      y: (tall - (drawn?.height ?? 0) * scale) / 2,
    }
    touched.current = false
    schedule()
  }

  // a chosen module fills the frame
  const zoomTo = (box: Box) => {
    const scale = Math.min(4, (room / box.w) * 0.92, (tall / box.h) * 0.92)
    view.current = {
      scale,
      x: room / 2 - (box.x + box.w / 2) * scale,
      y: tall / 2 - (box.y + box.h / 2) * scale,
    }
    schedule()
  }

  useEffect(() => {
    if (!drawn) return
    fresh()
    // the nodes walk to where they now are, so a grain change is followed
    // the clock starts on the first frame drawn, not here: laying a big graph out takes
    // longer than the walk itself, and the walk would be over before anything moved
    if (moves && (seats.current.size || frames.current.size))
      moving.current = { from: seats.current, boxes: frames.current, at: 0 }
    // kept as a share, since the next drawing resizes
    const kept = only && drawn.boxes.find((b) => b.id === only)
    const was = framed.current
    if (kept) {
      zoomTo(kept)
      framed.current = { w: drawn.width, h: drawn.height }
      return
    }
    if (touched.current && was.w && was.h) {
      const { scale, x, y } = view.current
      const share = {
        x: (room / 2 - x) / scale / was.w,
        y: (tall / 2 - y) / scale / was.h,
      }
      const next = scale * (was.w / Math.max(1, drawn.width))
      view.current = {
        scale: next,
        x: room / 2 - share.x * drawn.width * next,
        y: tall / 2 - share.y * drawn.height * next,
      }
      schedule()
    } else whole()
    framed.current = { w: drawn.width, h: drawn.height }
  }, [grain, drawn])

  // the wheel zooms about the cursor, so it stays on what it was over
  useEffect(() => {
    const canvas = board.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = canvas.getBoundingClientRect()
      const px = event.clientX - box.left
      const py = event.clientY - box.top
      const step = event.deltaY < 0 ? 1.12 : 1 / 1.12
      const next = Math.min(8, Math.max(0.2, view.current.scale * step))
      const ratio = next / view.current.scale
      view.current = {
        scale: next,
        x: px - (px - view.current.x) * ratio,
        y: py - (py - view.current.y) * ratio,
      }
      rushed()
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [drawn])

  return { view, drawing, schedule, rushed, seats, frames, moving, busy, whole, zoomTo }
}
