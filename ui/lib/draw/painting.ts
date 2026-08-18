// owner: finn
// goal: put the scene on the canvas, and keep asking for the next frame

import { useEffect, type RefObject } from "react"
import { fit } from "./canvas.ts"
import { draw, type Scene, type Walk } from "./paint.ts"

interface What {
  board: RefObject<HTMLCanvasElement | null>
  /** the panel, and the room the drawing gets inside it */
  wide: number
  tall: number
  view: RefObject<{ scale: number; x: number; y: number }>
  drawing: RefObject<() => void>
  schedule: () => void
  seats: RefObject<Map<string, { x: number; y: number }>>
  frames: RefObject<Map<string, { x: number; y: number; w: number; h: number }>>
  moving: RefObject<Walk | null>
  busy: RefObject<number>
  scene: Omit<Scene, "camera" | "walk" | "busy"> | null
}

export function usePainting(what: What) {
  const { board, wide, tall, view, drawing, schedule, seats, frames, moving, busy, scene } = what

  const render = () => {
    const canvas = board.current
    if (!canvas || !scene) return
    const pen = fit(canvas, wide - 24, tall)
    if (!pen) return
    const { scale, x, y } = view.current
    pen.clearRect(0, 0, wide, tall)
    pen.save()
    pen.translate(x, y)
    pen.scale(scale, scale)
    const {
      step,
      seats: sat,
      frames: framed,
    } = draw(pen, { ...scene, camera: view.current, walk: moving.current, busy: busy.current })
    pen.restore()

    // where everything ended up, so the next arrangement knows where to walk from
    seats.current = sat
    frames.current = framed
    // one frame more while moving, and one after to put the detail back
    if (step < 1) schedule()
    else if (performance.now() < busy.current) setTimeout(schedule, 150)
    else moving.current = null
  }

  // the newest closure is the one a frame should run, and every render asks for one
  drawing.current = render
  useEffect(schedule)
}
