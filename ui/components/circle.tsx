// owner: finn
// goal: dependency ring

import { useEffect, useRef, useState } from "react"
import { num, plural, shortPath } from "../lib/format.ts"
import { PAINT, fit } from "../lib/canvas.ts"
import type { Unit } from "../../src/layers.ts"

const MOST = 60 // prevent lag

export function Circle({
  units,
  cuts,
  onPick,
}: {
  units: Unit[]
  cuts?: Set<string>
  onPick?: (path: string) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(-1)

  const here = new Set(units.map((u) => u.path))
  const linked = units.filter(
    (u) =>
      Object.keys(u.out).some((p) => here.has(p)) || Object.keys(u.in).some((p) => here.has(p)),
  )
  const degree = (u: Unit) =>
    Object.keys(u.out).filter((p) => here.has(p)).length +
    Object.keys(u.in).filter((p) => here.has(p)).length
  // busiest first to decide who is on the ring, then back into stack order to sit on it
  const shown = [...linked]
    .sort((a, b) => degree(b) - degree(a))
    .slice(0, MOST)
    .sort((a, b) => a.level - b.level || a.path.localeCompare(b.path))

  const size = 620
  const middle = size / 2
  const ring = middle - 130
  const spot = (i: number) => {
    const angle = (i / shown.length) * Math.PI * 2 - Math.PI / 2
    return { angle, x: middle + Math.cos(angle) * ring, y: middle + Math.sin(angle) * ring }
  }

  useEffect(() => {
    const board = canvas.current
    if (!board) return
    const pen = fit(board, size, size)
    if (!pen) return
    pen.clearRect(0, 0, size, size)
    pen.font = "10px ui-sans-serif, system-ui, sans-serif"

    const place = new Map(shown.map((u, i) => [u.path, i]))
    const peak = Math.max(1, ...shown.flatMap((u) => Object.values(u.out)))

    // arcs first, so no line is drawn over a name
    shown.forEach((from, i) => {
      for (const [to, weight] of Object.entries(from.out)) {
        const j = place.get(to)
        if (j === undefined || j === i) continue
        const target = shown[j]
        const cut = cuts?.has(`${from.path} ${to}`)
        const colour = cut ? PAINT.cut : target.level >= from.level ? PAINT.loop : PAINT.down
        const quiet = near >= 0 && near !== i && near !== j
        const a = spot(i)
        const b = spot(j)
        pen.strokeStyle = `rgba(${colour}, ${quiet ? 0.05 : 0.2 + 0.6 * (weight / peak)})`
        pen.lineWidth = quiet ? 1 : 1 + 2 * (weight / peak)
        pen.beginPath()
        pen.moveTo(a.x, a.y)
        // bent toward the middle, so the ring stays open and the ends stay readable
        pen.quadraticCurveTo(middle, middle, b.x, b.y)
        pen.stroke()
      }
    })

    shown.forEach((unit, i) => {
      const at = spot(i)
      const lit = near === i
      pen.fillStyle = `rgba(${PAINT.quiet}, ${lit ? 0.9 : 0.45})`
      pen.beginPath()
      pen.arc(at.x, at.y, lit ? 5 : 3, 0, Math.PI * 2)
      pen.fill()

      if (shown.length > 44 && !lit) return
      const right = Math.cos(at.angle) > -0.01
      pen.save()
      pen.translate(at.x + Math.cos(at.angle) * 9, at.y + Math.sin(at.angle) * 9)
      pen.rotate(right ? at.angle : at.angle + Math.PI)
      pen.textAlign = right ? "left" : "right"
      pen.textBaseline = "middle"
      pen.fillStyle = lit ? "rgba(128,128,128,1)" : "rgba(128,128,128,0.75)"
      pen.fillText(shortPath(unit.path.split("/").slice(-2).join("/"), 22), 0, 0)
      pen.restore()
    })
  }, [units, cuts, near])

  const found = near >= 0 ? shown[near] : null
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <canvas
          ref={canvas}
          className="mx-auto my-2 block"
          onMouseLeave={() => setNear(-1)}
          onClick={() => found && onPick?.(found.path)}
          onMouseMove={(event) => {
            const box = canvas.current!.getBoundingClientRect()
            const x = event.clientX - box.left - middle
            const y = event.clientY - box.top - middle
            const away = Math.hypot(x, y)
            if (away < ring - 60 || away > ring + 80) return setNear(-1)
            // the ring is evenly divided, so the angle alone says which one is nearest
            const angle = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
            setNear(Math.round((angle / (Math.PI * 2)) * shown.length) % shown.length)
          }}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {found ? (
          <>
            <span className="text-foreground">{found.path}</span> · level {found.level} ·{" "}
            {plural(found.files, "file")} · leans on{" "}
            {plural(Object.keys(found.out).length, "group")}, carried by{" "}
            {plural(Object.keys(found.in).length, "group")}
          </>
        ) : (
          <>
            Every group on one ring, ordered bottom of the stack first. Hover one to keep only what
            it touches.
            {linked.length > shown.length &&
              ` Showing the ${shown.length} busiest of ${num(linked.length)} linked groups.`}
          </>
        )}
      </p>
    </div>
  )
}
