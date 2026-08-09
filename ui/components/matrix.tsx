// owner: finn
// goal: every dependency at once, as a grid that a hairball cannot be

import { useEffect, useRef, useState } from "react"
import { Tip } from "./tip.tsx"
import { num, plural, shortPath } from "../lib/format.ts"
import type { Unit } from "../../src/layers.ts"

// drawn rather than built: a grid of a thousand elements scrolls like tar
const PAINT = {
  down: "14, 165, 233", // sky, an import that leans on a lower level
  loop: "245, 158, 11", // amber, an import inside a loop
  cut: "239, 68, 68", // red, one the cut list names
  quiet: "128, 128, 128", // itself, and the lines between levels
}

const KEY: [string, string, string][] = [
  [
    PAINT.down,
    "Import",
    "row imports column, and leans on a level below its own. The normal direction",
  ],
  [
    PAINT.loop,
    "Loop",
    "an import between groups that reach each other both ways, so neither can move alone",
  ],
  [
    PAINT.cut,
    "Break",
    "removing these few leaves nothing looping, checked against the graph rather than guessed",
  ],
  [PAINT.quiet, "Inside", "the group against itself, so the imports that never leave it"],
]

// a canvas has a size a browser will refuse, and 2000 rows is past it in every
// direction. Nothing readable lives up there anyway, so the grid stops before it
const LIMIT = 400

export function Matrix({
  units,
  across,
  most = 12,
  cuts,
  order,
  onPick,
}: {
  units: Unit[]
  /** what the columns may hold, when the rows have been narrowed and the targets have not */
  across?: Unit[]
  /** rows and columns to draw, busiest first: past a screenful a grid says nothing */
  most?: number
  /** "from to" for every import the cut list names, so a loop shows where to open it */
  cuts?: Set<string>
  /** an order chosen elsewhere, since the same groups are listed in more than one place */
  order?: (a: Unit, b: Unit) => number
  onPick?: (path: string) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hint, setHint] = useState<{ x: number; y: number; text: string } | null>(null)

  // a link to a group that is not on screen draws nothing, so it earns no row either.
  // rows and columns are separate sets: narrowing who imports must not hide what they import
  const targets = across ?? units
  const rowSet = new Set(units.map((u) => u.path))
  const colSet = new Set(targets.map((u) => u.path))
  const leaving = (u: Unit) => Object.keys(u.out).filter((p) => colSet.has(p))
  const arriving = (u: Unit) => Object.keys(u.in).filter((p) => rowSet.has(p))
  // each axis is ranked by what it does on that axis, then put back in reading order
  const busiest = (list: Unit[], by: (u: Unit) => number) =>
    [...list]
      .sort((a, b) => by(b) - by(a))
      .slice(0, Math.min(most, LIMIT))
      .sort(order ?? ((a, b) => a.level - b.level || a.path.localeCompare(b.path)))

  // a group that imports nothing here has an empty row, one nobody imports an empty column
  const importers = units.filter((u) => leaving(u).length)
  const imported = targets.filter((u) => arriving(u).length)
  const rows = busiest(importers, (u) => leaving(u).length)
  const cols = busiest(imported, (u) => arriving(u).length)
  const peak = Math.max(1, ...rows.flatMap((u) => Object.values(u.out)))
  const alone = units.filter((u) => !leaving(u).length && !arriving(u).length).length
  const widest = Math.max(rows.length, cols.length)
  const cell = widest > 200 ? 8 : widest > 24 ? 12 : 20

  const paint = (row: Unit, col: Unit) => {
    const weight = row.out[col.path] ?? 0
    if (!weight) return null
    // types are erased by the build, so an import made only of them is drawn hollow
    const erased = (row.types[col.path] ?? 0) === weight
    const shape = {
      weight,
      erased,
      why: erased ? ", and only types, so the build never sees it" : "",
    }
    if (cuts?.has(`${row.path} ${col.path}`))
      return { ...shape, colour: PAINT.cut, why: `${shape.why}. Removing it helps open the loop` }
    // levels only ever point downward, so an equal one is a loop closing
    if (col.level >= row.level)
      return { ...shape, colour: PAINT.loop, why: `${shape.why}, inside a loop` }
    return { ...shape, colour: PAINT.down }
  }

  useEffect(() => {
    const board = canvas.current
    if (!board) return
    // two is as sharp as a grid of flat squares can look, and it halves the pixels
    const scale = Math.min(devicePixelRatio || 1, 2)
    board.width = cols.length * cell * scale
    board.height = rows.length * cell * scale
    board.style.width = `${cols.length * cell}px`
    board.style.height = `${rows.length * cell}px`
    const pen = board.getContext("2d")
    if (!pen) return
    pen.scale(scale, scale)

    rows.forEach((row, y) =>
      cols.forEach((col, x) => {
        const mark = paint(row, col)
        if (row.path === col.path) pen.fillStyle = `rgba(${PAINT.quiet}, 0.22)`
        else if (mark) {
          const ink = `rgba(${mark.colour}, ${0.35 + 0.65 * (mark.weight / peak)})`
          if (mark.erased) {
            pen.strokeStyle = ink
            pen.lineWidth = 1.5
            pen.strokeRect(x * cell + 1, y * cell + 1, cell - 3, cell - 3)
            return
          }
          pen.fillStyle = ink
        } else return
        pen.fillRect(x * cell, y * cell, cell - 1, cell - 1)
      }),
    )

    // one line where the level changes, so a big grid reads as blocks and not as noise
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
  }, [units, most, cell, cuts, order])

  const at = (event: React.MouseEvent) => {
    const box = canvas.current!.getBoundingClientRect()
    const x = Math.floor((event.clientX - box.left) / cell)
    const y = Math.floor((event.clientY - box.top) / cell)
    return rows[y] && cols[x] ? { row: rows[y], col: cols[x], x, y } : null
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tip text="a hollow square carries only type imports, which typescript erases, so nothing of it is there at runtime">
          <span className="flex items-center gap-1.5 text-xs">
            <span className="border-muted-foreground size-3 rounded-[2px] border-2" />
            Types only
          </span>
        </Tip>
        {KEY.map(([colour, label, why]) => (
          <Tip key={label} text={why}>
            <span className="flex items-center gap-1.5 text-xs">
              <span
                style={{ background: `rgba(${colour}, ${colour === PAINT.quiet ? 0.22 : 0.9})` }}
                className="size-3 rounded-[2px]"
              />
              {label}
            </span>
          </Tip>
        ))}
      </div>

      <div className="relative max-h-[70vh] overflow-auto">
        <div className="mx-auto my-6 flex w-max items-start">
          <div className="bg-card sticky left-0 z-10 pr-2 text-right text-xs">
            {rows.map((row, y) => (
              <div
                key={row.path}
                style={{ height: cell }}
                className="flex w-56 items-center justify-between gap-2 leading-none"
              >
                <span className="text-muted-foreground tabular-nums">{y + 1}.</span>
                <Tip text={row.path} className="min-w-0">
                  <button
                    onClick={() => onPick?.(row.path)}
                    className="text-muted-foreground hover:text-foreground w-full cursor-pointer truncate text-right"
                  >
                    {shortPath(row.path, 34)}
                  </button>
                </Tip>
              </div>
            ))}
          </div>
          <canvas
            ref={canvas}
            onMouseLeave={() => setHint(null)}
            onClick={(event) => {
              const cursor = at(event)
              if (cursor) onPick?.(cursor.col.path)
            }}
            onMouseMove={(event) => {
              const cursor = at(event)
              if (!cursor) return setHint(null)
              const { row, col, x, y } = cursor
              const mark = paint(row, col)
              const board = canvas.current!
              // against the scrolling box, which is what the bubble is positioned in
              setHint({
                x: board.offsetLeft + (x + 0.5) * cell,
                y: board.offsetTop + (y + 1) * cell,
                text:
                  row.path === col.path
                    ? `${row.path} · ${plural(row.internal, "import")} stay inside it`
                    : mark
                      ? `${row.path} imports ${col.path} · ${plural(mark.weight, "time")}${mark.why}`
                      : `${row.path} does not import ${col.path}`,
              })
            }}
          />
        </div>
        {hint && (
          <span
            style={{ left: hint.x, top: hint.y + 6 }}
            className="bg-secondary text-secondary-foreground pointer-events-none absolute z-20 w-max max-w-72 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs shadow-md"
          >
            {hint.text}
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Row imports column, darker where more files do it.
        {(importers.length > rows.length || imported.length > cols.length) && (
          <Tip
            className="ml-1"
            text="the busiest groups are the ones a grid has anything to say about, the rest are in the table below"
          >
            <span className="underline decoration-dotted">
              Showing {rows.length} of {num(importers.length)} rows and {cols.length} of{" "}
              {num(imported.length)} columns.
            </span>
          </Tip>
        )}
        {alone > 0 && (
          <Tip
            className="ml-1"
            text="nothing on this screen imports them, and they import nothing on it"
          >
            <span className="underline decoration-dotted">
              {num(alone)} groups link to nothing here.
            </span>
          </Tip>
        )}
      </p>
    </div>
  )
}
