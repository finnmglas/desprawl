// owner: finn
// goal: the picture itself, drawn from what the view decided to show

import { PAINT, plain } from "./canvas.ts"
import { num, shortPath } from "../text/format.ts"
import { shapeOf } from "../text/verdict.ts"
import { runs, type Held, type Seat } from "./wires.ts"
import type { Box, Grain, Net, Spot } from "./network.ts"
import type { Unit } from "../../../src/read/layers.ts"

export const IMPORT = PAINT.down
export const CALL = PAINT.loop
// red, and the only edge here that crosses a repo
export const REQUEST = PAINT.cut
// the strip a module name sits on
export const STRIP = 13
// heads on every wire stop reading as direction once they overlap
export const HEADS = 2600

/** a hue off the name, so a palette never runs out */
export const hued = (name: string): string => {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${hash}, 62%, 58%)`
}

/** where everything was drawn last time, so the next arrangement walks rather than jumps */
export interface Walk {
  from: Map<string, { x: number; y: number }>
  boxes: Map<string, { x: number; y: number; w: number; h: number }>
  /** when the first frame of it was drawn, 0 until then */
  at: number
}

/** everything a frame is drawn from: what to draw, how, and what is picked out of it */
export interface Scene {
  drawn: Net
  at: Map<string, Spot>
  boxAt: Map<string, Box>
  shown: Held[]
  sits: Seat
  camera: { scale: number; x: number; y: number }
  show: {
    grain: Grain
    imports: boolean
    calls: boolean
    http: boolean
    bounds: boolean
    names: boolean
    numbers: boolean
    bundle: boolean
    plan: boolean
    edges: string
  }
  picked: { only: string; near: Spot | null; edge: Held | null; hunted: string }
  walk: Walk | null
  /** until when a gesture is still going, so the detail waits for it to stop */
  busy: number
  called: Map<string, string>
  units: Map<string, Unit>
  colourOf: (spot: Spot) => string | null
  owner: (path: string) => string
}

/** one frame, and where everything ended up, since that is where the next one walks from */
export function draw(
  pen: CanvasRenderingContext2D,
  scene: Scene,
): {
  step: number
  seats: Map<string, { x: number; y: number }>
  frames: Map<string, { x: number; y: number; w: number; h: number }>
} {
  const { drawn, at, boxAt, shown, sits, called, units, colourOf, owner, walk } = scene
  const { scale } = scene.camera
  const { grain, bounds, names, numbers, bundle, plan, imports, http, edges } = scene.show
  const wired = scene.show.calls
  const { only, near, edge, hunted } = scene.picked

  const now = performance.now()
  // the clock starts on the first frame drawn, not when the layout changed: laying a big
  // graph out takes longer than the walk, and the walk would be over before anything moved
  if (walk && !walk.at) walk.at = now
  const step = walk ? Math.min(1, (now - walk.at) / 500) : 1
  // slow out: settling rather than stopping dead is what reads as movement
  const eased = 1 - (1 - step) ** 3
  const seat = (spot: Spot) => {
    const was = step < 1 && walk ? walk.from.get(spot.id) : undefined
    if (!was) return spot
    return { x: was.x + (spot.x - was.x) * eased, y: was.y + (spot.y - was.y) * eased }
  }
  /** a box on its way from where it was drawn last time to where it belongs now */
  const framed = (box: Box) => {
    const was = step < 1 && walk ? walk.boxes.get(box.id) : undefined
    if (!was) return box
    return {
      ...box,
      x: was.x + (box.x - was.x) * eased,
      y: was.y + (box.y - was.y) * eased,
      w: was.w + (box.w - was.w) * eased,
      h: was.h + (box.h - was.h) * eased,
    }
  }
  const rough = step < 1 || now < scene.busy
  const text = (base: number) => (base * scale ** 0.35) / scale

  // a spot at this grain, or the box for a file
  const where = (id: string) => {
    const spot = at.get(id)
    if (spot) return { ...seat(spot), r: spot.r }
    const held = boxAt.get(id)
    if (!held) return null
    const box = framed(held)
    return { x: box.x + box.w / 2, y: box.y + box.h / 2, r: 0 }
  }

  const lit = near ? new Set([near.id]) : null
  const touching = new Set<string>()
  if (near)
    for (const wire of drawn.wires) {
      if (wire.from === near.id) touching.add(wire.to)
      if (wire.to === near.id) touching.add(wire.from)
    }
  // a hovered line lights both of its ends, since a line means nothing without them
  const ends = edge && !near ? new Set([edge.from, edge.to]) : null

  if (bounds)
    for (const held of drawn.boxes) {
      const box = framed(held)
      const picked = box.id === only
      if (box.depth === -1) {
        // a repo lane: a border and its name, so two repos never read as one picture
        pen.setLineDash([])
        pen.strokeStyle = `rgba(${PAINT.quiet}, 0.35)`
        pen.lineWidth = 1 / scale
        pen.strokeRect(box.x, box.y, box.w, box.h)
        pen.fillStyle = `rgba(${PAINT.quiet}, 0.9)`
        pen.font = `600 ${text(13)}px ui-sans-serif, system-ui, sans-serif`
        pen.fillText(box.label, box.x + 4, box.y - 4)
        continue
      }
      if (box.depth === 0) {
        // said once down the side: a box per module is a line to look past
        pen.setLineDash([])
        pen.fillStyle = `rgba(${PAINT.quiet}, 0.55)`
        pen.font = `${text(12)}px ui-sans-serif, system-ui, sans-serif`
        pen.fillText(box.label.replace("level ", "L"), box.x + 2, box.y + text(12))
        continue
      }
      // hovered, or touched by what is hovered, since a module box has no dot to light
      const near_ = (!!near && (box.id === near.id || touching.has(box.id))) || !!ends?.has(box.id)
      if ((plan || grain === "module") && box.depth === 1) {
        const unit = units.get(box.id)
        pen.setLineDash([])
        pen.fillStyle = `rgba(${picked ? PAINT.down : PAINT.quiet}, ${picked ? 0.2 : near_ ? 0.18 : 0.09})`
        pen.fillRect(box.x, box.y, box.w, box.h)
        pen.strokeStyle = picked
          ? `rgba(${PAINT.down}, 0.9)`
          : `rgba(${PAINT.quiet}, ${near_ ? 0.85 : 0.5})`
        pen.lineWidth = (picked || near_ ? 2 : 1) / scale
        pen.strokeRect(box.x, box.y, box.w, box.h)
        if (unit) {
          const out = Object.values(unit.out).reduce((sum, n) => sum + n, 0)
          const into = Object.values(unit.in).reduce((sum, n) => sum + n, 0)
          const shape = shapeOf(unit.internal, out, into, Object.keys(unit.out).length)
          const said = (
            plan
              ? [
                  [called.get(box.id) ?? box.label, 15, 0.95],
                  [`${num(unit.files)} files · ${num(unit.lines)} loc · L${unit.level}`, 11, 0.6],
                  [shape.label, 11, 0.6],
                  [owner(box.id) && `mostly ${owner(box.id)}`, 11, 0.45],
                ]
              : [
                  [called.get(box.id) ?? box.label, 13, 0.95],
                  [`${num(unit.files)} files · ${num(unit.lines)} loc`, 10, 0.6],
                  [shape.label, 10, 0.5],
                ]
          ) as [string, number, number][]
          let line = box.y + text(plan ? 16 : 13)
          for (const [say, size, alpha] of said) {
            // too small for a line says nothing rather than saying it over itself
            if (!say || line > box.y + box.h - 2 || box.w * scale < 90) continue
            pen.fillStyle = `rgba(${PAINT.quiet}, ${alpha})`
            pen.font = `${text(size)}px ui-sans-serif, system-ui, sans-serif`
            pen.fillText(say, box.x + 6, line)
            line += text(size) * 1.35
          }
        }
        continue
      }
      pen.setLineDash([3, 3])
      pen.strokeStyle = picked
        ? `rgba(${PAINT.down}, 0.9)`
        : near_
          ? `rgba(${PAINT.quiet}, 0.85)`
          : `rgba(${PAINT.quiet}, ${box.depth === 1 ? 0.4 : 0.24})`
      pen.lineWidth = (picked || near_ ? 2 : 1) / scale
      pen.strokeRect(box.x, box.y, box.w, box.h)
      // its own strip, so there is always somewhere to click
      if (box.depth === 1) {
        pen.setLineDash([])
        pen.fillStyle = `rgba(${picked ? PAINT.down : PAINT.quiet}, ${picked ? 0.22 : near_ ? 0.18 : 0.1})`
        pen.fillRect(box.x, box.y, box.w, grain === "module" ? box.h : STRIP)
      }
      if (names && box.depth > 0 && box.w * scale > 46) {
        pen.setLineDash([])
        pen.fillStyle = `rgba(${PAINT.quiet}, 0.75)`
        pen.font = `${text(box.depth === 1 ? 14 : 11)}px ui-sans-serif, system-ui, sans-serif`
        const held =
          grain === "module"
            ? (units.get(box.id)?.files ?? 0)
            : drawn.spots.filter((s) => s.box === box.id).length
        pen.fillText(
          (box.depth === 1 ? (called.get(box.id) ?? box.label) : box.label) +
            (numbers && held ? ` ${held}` : ``),
          box.x + 3,
          box.y + (box.depth === 1 ? 10 : 8),
        )
      }
    }
  pen.setLineDash([])

  // the module a node belongs to, which is what a chosen one is chosen by
  const unitOfSpot = (id: string) => {
    const spot = at.get(id)
    if (!spot) return boxAt.get(id)?.parent ?? id
    return grain === "declaration" ? (boxAt.get(spot.box)?.parent ?? spot.box) : spot.box
  }
  const chosen = (id: string) => !only || unitOfSpot(id) === only || id === only

  // one path per colour: forty thousand strokes is what makes a canvas crawl
  const lines = new Map<string, Path2D>()
  const heads = new Map<string, Path2D>()
  const ink = (colour: string, alpha: number) => `rgba(${colour}, ${alpha})`
  // strokes batch by key, so alpha has to live in the colour itself
  const fade = (colour: string, alpha: number) =>
    colour.replace(/^(hsl|rgb)\((.+)\)$/, `$1a($2, ${alpha})`)
  const draw = (key: string) => {
    const found = lines.get(key) ?? new Path2D()
    lines.set(key, found)
    if (!heads.has(key)) heads.set(key, new Path2D())
    return { line: found, head: heads.get(key)! }
  }
  const styles = new Map<string, string>()

  // one wire per module pair: at this size the lines are the noise

  for (const wire of shown) {
    // no dots here, so a line staying inside one has nothing to join
    if (plan && unitOfSpot(wire.from) === unitOfSpot(wire.to)) continue
    const from = where(wire.from)
    const to = where(wire.to)
    if (!from || !to) continue
    const quiet =
      (lit && !lit.has(wire.from) && !lit.has(wire.to)) ||
      (!!ends && (wire.from !== edge?.from || wire.to !== edge?.to)) ||
      (!!only && !chosen(wire.from) && !chosen(wire.to))
    // by kind, by the module it leaves, or by whether it leaves one
    const leaves = unitOfSpot(wire.from) !== unitOfSpot(wire.to)
    const tint =
      edges === "module"
        ? hued(unitOfSpot(wire.from))
        : edges === "leaving"
          ? leaves
            ? null
            : `rgb(${PAINT.quiet})`
          : null
    const kinds: [number, string, number][] = []
    if (imports && wire.imports) kinds.push([wire.imports, IMPORT, 1])
    if (wired && wire.calls) kinds.push([wire.calls, CALL, -1])
    // straight, since the two bows are taken, and never faded like a type import
    if (http && wire.http) kinds.push([wire.http, REQUEST, 0])
    for (const [weight, colour, bow] of kinds) {
      // heavier pairs read darker, in a few steps so the batching survives it
      const heft = Math.min(1, weight / 6)
      const request = colour === REQUEST
      const alpha = quiet
        ? 0.03
        : lit
          ? 0.85
          : request
            ? 0.55 + 0.35 * heft
            : wire.types
              ? 0.13
              : 0.22 + 0.3 * heft
      // a request stays red whatever the lines are coloured by: nothing else crosses a repo
      const own = request ? null : tint
      const key = `${own ?? colour} ${alpha.toFixed(2)}`
      const { line, head } = draw(key)
      styles.set(key, own ? fade(own, alpha) : ink(colour, alpha))
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      const dx = to.x - from.x
      const dy = to.y - from.y
      const away = Math.hypot(dx, dy) || 1
      // both kinds between one pair bow apart, so neither hides the other
      const lift = Math.min(26, away / 7) * bow
      const cx = mx - (dy / away) * lift
      const cy = my + (dx / away) * lift
      line.moveTo(from.x, from.y)
      line.quadraticCurveTo(cx, cy, to.x, to.y)
      if (!rough && (request || shown.length <= HEADS || lit)) {
        // sized on screen like its line, or zoom grows fans instead of arrows
        const back = 8 / scale
        const arrow = (tipX: number, tipY: number, ax: number, ay: number) => {
          const long = Math.hypot(ax, ay) || 1
          head.moveTo(tipX, tipY)
          head.lineTo(
            tipX - (ax / long) * back + (ay / long) * back * 0.5,
            tipY - (ay / long) * back - (ax / long) * back * 0.5,
          )
          head.lineTo(
            tipX - (ax / long) * back - (ay / long) * back * 0.5,
            tipY - (ay / long) * back + (ax / long) * back * 0.5,
          )
          head.closePath()
        }
        // one where the curve arrives, and one halfway along it, since the end of a
        // long line is nowhere near the dot a reader is looking at
        const ax = to.x - cx
        const ay = to.y - cy
        const long = Math.hypot(ax, ay) || 1
        arrow(to.x - (ax / long) * (to.r + 1), to.y - (ay / long) * (to.r + 1), ax, ay)
        // the middle of a quadratic, where the tangent is the straight line between the ends
        if (away > back * 6)
          arrow(
            (from.x + 2 * cx + to.x) / 4,
            (from.y + 2 * cy + to.y) / 4,
            to.x - from.x,
            to.y - from.y,
          )
      }
    }
  }
  if (edge)
    for (const [on, colour, bow] of [
      [imports && edge.imports, IMPORT, 1],
      [wired && edge.calls, CALL, -1],
      [http && edge.http, REQUEST, 0],
    ] as [number | boolean, string, number][]) {
      if (!on) continue
      const held = runs(edge, bow, sits)
      if (!held) continue
      const path = new Path2D()
      path.moveTo(held.from.x, held.from.y)
      path.quadraticCurveTo(held.cx, held.cy, held.to.x, held.to.y)
      pen.setLineDash(colour === REQUEST ? [7 / scale, 5 / scale] : [])
      pen.strokeStyle = ink(colour, 1)
      pen.lineWidth = 2.6 / scale
      pen.stroke(path)
    }
  pen.setLineDash([])

  for (const [key, path] of lines) {
    const request = key.startsWith(REQUEST)
    pen.strokeStyle = styles.get(key)!
    // the red ones are the point of the picture when they are there at all, and dashed:
    // an import binds two files together, a request only agrees with one about a path
    pen.setLineDash(request ? [7 / scale, 5 / scale] : [])
    pen.lineWidth = ((bundle ? 1.6 : 1) * (request ? 1.8 : 1)) / scale
    pen.stroke(path)
    pen.fillStyle = styles.get(key)!
    pen.fill(heads.get(key)!)
  }
  pen.setLineDash([])

  // what a bundled line stands for, which is the only number worth writing on one
  if (numbers && bundle)
    for (const wire of shown) {
      if (wire.held < 2) continue
      const from = where(wire.from)
      const to = where(wire.to)
      if (!from || !to || (only && !chosen(wire.from) && !chosen(wire.to))) continue
      pen.fillStyle = `rgba(${PAINT.quiet}, 0.9)`
      pen.font = `${text(12)}px ui-sans-serif, system-ui, sans-serif`
      pen.fillText(String(wire.held), (from.x + to.x) / 2, (from.y + to.y) / 2)
    }

  if (!plan && grain !== "module")
    for (const spot of drawn.spots) {
      const hit =
        hunted &&
        (spot.label.toLowerCase().includes(hunted) || spot.id.toLowerCase().includes(hunted))
      const held = ends?.has(spot.id)
      const quiet =
        (lit && !lit.has(spot.id) && !touching.has(spot.id)) ||
        (!!ends && !held) ||
        (hunted && !hit) ||
        !chosen(spot.id)
      const own = colourOf(spot)
      const now = seat(spot)
      pen.globalAlpha = quiet ? 0.16 : lit?.has(spot.id) || held ? 1 : 0.9
      pen.fillStyle = hit ? `rgba(${PAINT.cut}, 0.95)` : (own ?? `rgb(${plain()})`)
      pen.beginPath()
      pen.arc(now.x, now.y, spot.r + (lit?.has(spot.id) || held ? 2 : 0), 0, Math.PI * 2)
      pen.fill()
      pen.globalAlpha = 1
    }

  if (names && !rough && !plan && grain !== "module")
    for (const spot of drawn.spots) {
      // a name waits for the zoom that fits it, unless it is what the cursor is on or near
      if (ends && !ends.has(spot.id)) continue
      if (!lit?.has(spot.id) && !touching.has(spot.id) && !ends && spot.r * scale < 4.5) continue
      // the two ends of a hovered line are the only thing on screen worth reading
      const held = lit?.has(spot.id) || ends?.has(spot.id)
      pen.fillStyle = held ? `rgb(${plain()})` : `rgba(${PAINT.quiet}, 0.8)`
      pen.font = `${held ? 600 : 400} ${text(13)}px ui-sans-serif, system-ui, sans-serif`
      const put = seat(spot)
      pen.fillText(shortPath(spot.label, 18), put.x + spot.r + 3, put.y + 4)
    }
  pen.restore()

  return {
    step,
    seats: new Map(drawn.spots.map((spot) => [spot.id, seat(spot)])),
    frames: new Map(
      drawn.boxes.map((box) => {
        const one = framed(box)
        return [box.id, { x: one.x, y: one.y, w: one.w, h: one.h }]
      }),
    ),
  }
}
