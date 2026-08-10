// owner: finn
// goal: every dependency at once, as a grid

import { useEffect, useRef, useState } from "react"
import { Tip } from "../atoms/tip.tsx"
import { PAINT, fit } from "../../lib/canvas.ts"
import { num, plural, shortPath } from "../../lib/format.ts"
import type { Unit } from "../../../src/layers.ts"

const KEY: { colour: string; label: string; why: string; cross?: boolean }[] = [
  {
    colour: PAINT.down,
    label: "Import",
    why: "row imports column, and leans on a level below its own. The normal direction",
  },
  {
    colour: PAINT.loop,
    label: "Not isolated",
    why: "these two folders reach each other both ways. Nothing breaks when it runs, but neither can be lifted out, tested or read without the other",
  },
  {
    colour: PAINT.cut,
    label: "Break",
    why: "removing these few leaves nothing looping, checked against the graph rather than guessed",
  },
  {
    colour: PAINT.cut,
    label: "Cycle",
    cross: true,
    why: "a file in the row really does import one that imports it back. This one is a ring at runtime, not a matter of tidiness. On the diagonal it means the whole ring sits inside that one group",
  },
  {
    colour: PAINT.quiet,
    label: "Inside",
    why: "the group against itself, so the imports that never leave it",
  },
]

// a browser refuses a bigger canvas, and nothing readable is up there
const LIMIT = 400

export function Matrix({
  units,
  across,
  most = 12,
  cuts,
  rings,
  order,
  onPick,
}: {
  units: Unit[]
  /** what the columns may hold when the rows are narrowed */
  across?: Unit[]
  /** rows and columns to draw, busiest first */
  most?: number
  /** the imports the cut list names */
  cuts?: Set<string>
  /** pairs a real file ring runs through, which is a loop at runtime and not a matter of tidiness */
  rings?: Set<string>
  /** an order chosen elsewhere */
  order?: (a: Unit, b: Unit) => number
  onPick?: (path: string) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hint, setHint] = useState<{ x: number; y: number; text: string } | null>(null)

  // separate sets: narrowing rows must not hide columns
  const targets = across ?? units
  const rowSet = new Set(units.map((u) => u.path))
  const colSet = new Set(targets.map((u) => u.path))
  const leaving = (u: Unit) => Object.keys(u.out).filter((p) => colSet.has(p))
  const arriving = (u: Unit) => Object.keys(u.in).filter((p) => rowSet.has(p))
  const levelOf = new Map([...units, ...targets].map((u) => [u.path, u.level]))
  const links = (u: Unit, side: "row" | "col") =>
    side === "row" ? leaving(u).length : arriving(u).length

  // a grid showing only some of the groups should show the ones there is something to
  // see in: a ring outranks a cut, a cut outranks an import that merely climbs
  const worst = (u: Unit, side: "row" | "col") => {
    let score = rings?.has(`${u.path} ${u.path}`) ? 4 : 0
    const pairs: [string, string][] =
      side === "row"
        ? leaving(u).map((to) => [u.path, to])
        : arriving(u).map((from) => [from, u.path])
    for (const [from, to] of pairs) {
      if (from === to) continue
      if (rings?.has(`${from} ${to}`)) score += 4
      else if (cuts?.has(`${from} ${to}`)) score += 2
      else if ((levelOf.get(to) ?? 0) >= (levelOf.get(from) ?? 0)) score += 1
    }
    return score
  }

  const busiest = (list: Unit[], side: "row" | "col") =>
    [...list]
      .sort((a, b) => worst(b, side) - worst(a, side) || links(b, side) - links(a, side))
      .slice(0, Math.min(most, LIMIT))
      .sort(order ?? ((a, b) => a.level - b.level || a.path.localeCompare(b.path)))

  // no row for a group that imports nothing here
  const importers = units.filter((u) => leaving(u).length)
  const imported = targets.filter((u) => arriving(u).length)
  const rows = busiest(importers, "row")
  const cols = busiest(imported, "col")
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
      ring: !!rings?.has(`${row.path} ${col.path}`),
      why: erased ? ", and only types, so the build never sees it" : "",
    }
    if (shape.ring)
      return {
        ...shape,
        colour: PAINT.cut,
        why: `${shape.why}. A file here imports one that imports it back, so this one runs`,
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
    const pen = fit(board, cols.length * cell, rows.length * cell)
    if (!pen) return

    // a real ring is crossed out, the rest of the grid is tidiness and this one runs
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

    rows.forEach((row, y) =>
      cols.forEach((col, x) => {
        // a ring held inside one group is invisible between groups, so it is drawn on the
        // diagonal instead: the whole loop is in there, and only opening it would show it
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
  }, [units, most, cell, cuts, rings, order])

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
        {KEY.map(({ colour, label, why, cross }) => (
          <Tip key={label} text={why}>
            <span className="flex items-center gap-1.5 text-xs">
              <span
                style={{ background: `rgba(${colour}, ${colour === PAINT.quiet ? 0.22 : 0.9})` }}
                className={
                  cross
                    ? "grid size-4 place-items-center rounded-[2px] text-[15px] leading-none font-bold text-white"
                    : "size-3 rounded-[2px]"
                }
              >
                {cross ? "\u00d7" : null}
              </span>
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
                    ? `${row.path} · ${plural(row.internal, "import")} stay inside it${
                        rings?.has(`${row.path} ${row.path}`)
                          ? ". A ring of files loops entirely inside it, so no grouping above shows it"
                          : ""
                      }`
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
        Row imports column, darker where more files do it. Most is about best practice, but the "x"
        marked ones are real issues to fix.
        {(importers.length > rows.length || imported.length > cols.length) && (
          <Tip
            className="ml-1"
            text="the ones with cycles, breaks and imports that climb come first, since a grid this size can only say something about some of them. The rest are in the table below"
          >
            <span className="underline decoration-dotted">
              Showing {rows.length} of {num(importers.length)} rows and {cols.length} of{" "}
              {num(imported.length)} columns, worst first.
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
