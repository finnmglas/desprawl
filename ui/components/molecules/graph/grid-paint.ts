// owner: finn
// goal: the grid itself, painted cell by cell

import { PAINT, fit } from "../../../lib/draw/canvas.ts"
import type { Unit } from "../../../../src/read/layers.ts"

interface What {
  canvas: HTMLCanvasElement | null
  rows: Unit[]
  cols: Unit[]
  cell: number
  peak: number
  chosen?: string
  rings?: Set<string>
  /** sorted by hand, so the level lines would land nowhere */
  order?: unknown
  /** what one cell means, or nothing where there is no import */
  paint: (
    row: Unit,
    col: Unit,
  ) => { colour: string; weight: number; erased?: boolean; ring?: boolean } | null
}

export function grid({ canvas: board, rows, cols, cell, peak, chosen, rings, order, paint }: What) {
  if (!board) return
  const pen = fit(board, cols.length * cell, rows.length * cell)
  if (!pen) return

  // a real ring is crossed out, the rest is tidiness
  const cross = (x: number, y: number) => {
    const pad = cell > 16 ? 3 : cell > 10 ? 2 : 1
    pen.strokeStyle = "rgba(255, 255, 255, 0.98)"
    pen.lineWidth = cell > 16 ? 3 : cell > 10 ? 2.5 : 2
    pen.lineCap = "round"
    pen.beginPath()
    pen.moveTo(x * cell + pad, y * cell + pad)
    pen.lineTo(x * cell + cell - pad - 1, y * cell + cell - pad - 1)
    pen.moveTo(x * cell + cell - pad - 1, y * cell + pad)
    pen.lineTo(x * cell + pad, y * cell + cell - pad - 1)
    pen.stroke()
  }

  // the band first, so the chosen group draws on top
  const pickedRow = rows.findIndex((r) => r.path === chosen)
  const pickedCol = cols.findIndex((c) => c.path === chosen)
  if (pickedRow >= 0 || pickedCol >= 0) {
    pen.fillStyle = `rgba(${PAINT.down}, 0.14)`
    if (pickedRow >= 0) pen.fillRect(0, pickedRow * cell, cols.length * cell, cell - 1)
    if (pickedCol >= 0) pen.fillRect(pickedCol * cell, 0, cell - 1, rows.length * cell)
  }

  rows.forEach((row, y) =>
    cols.forEach((col, x) => {
      // a ring inside one group is invisible between groups
      if (row.path === col.path) {
        const held = rings?.has(`${row.path} ${row.path}`)
        pen.fillStyle = held ? `rgba(${PAINT.cut}, 0.85)` : `rgba(${PAINT.quiet}, 0.22)`
        pen.fillRect(x * cell, y * cell, cell - 1, cell - 1)
        if (held) cross(x, y)
        return
      }
      const mark = paint(row, col)
      if (!mark) return
      const ink = `rgba(${mark.colour}, ${0.35 + 0.65 * (mark.weight / peak)})`
      if (mark.erased) {
        pen.strokeStyle = ink
        pen.lineWidth = 1.5
        pen.strokeRect(x * cell + 1, y * cell + 1, cell - 3, cell - 3)
        return
      }
      pen.fillStyle = ink
      pen.fillRect(x * cell, y * cell, cell - 1, cell - 1)
      if (mark.ring) cross(x, y)
    }),
  )

  // one line where the level changes
  pen.strokeStyle = `rgba(${PAINT.quiet}, 0.55)`
  pen.lineWidth = 1
  pen.beginPath()
  // only in the level order: under any other, a level boundary lands wherever it likes
  if (!order)
    rows.forEach((row, y) => {
      if (y && row.level !== rows[y - 1].level) {
        pen.moveTo(0, y * cell - 0.5)
        pen.lineTo(cols.length * cell, y * cell - 0.5)
      }
    })
  if (!order)
    cols.forEach((col, x) => {
      if (x && col.level !== cols[x - 1].level) {
        pen.moveTo(x * cell - 0.5, 0)
        pen.lineTo(x * cell - 0.5, rows.length * cell)
      }
    })
  pen.stroke()
}
