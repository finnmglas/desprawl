// owner: finn
// goal: the graph itself, every node inside the module holding it

import { useEffect, useMemo, useRef, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Button } from "../components/atoms/button.tsx"
import { Card, CardContent } from "../components/atoms/card.tsx"
import { CardHead } from "../components/molecules/card-head.tsx"
import { Section } from "../components/atoms/section.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Loading, Onward } from "../components/molecules/onward.tsx"
import { Save } from "../components/molecules/save.tsx"
import { Tabs } from "../components/atoms/tabs.tsx"
import { Menu, MenuSection } from "../components/molecules/menu.tsx"
import { BRANDS } from "../lib/brands.ts"
import { LANGS } from "../../src/langs.ts"
import { onlyIn } from "../../src/dialects.ts"
import { PAINT, fit, plain } from "../lib/canvas.ts"
import { callGraph, importGraph } from "../lib/live.ts"
import { file as asFile, group as asGroup, holds, isFile, symbol, useGoing } from "../lib/going.tsx"
import { keep, recall, useKept } from "../lib/kept.ts"
import { num, plural, shortPath } from "../lib/format.ts"
import { namesOf } from "../../src/naming.ts"
import { shapeOf } from "../lib/verdict.ts"
import { hands, worked } from "../lib/people.ts"
import { net, type Box, type Grain, type Net, type Spot, type Wire } from "../lib/network.ts"
import { asRows, knowledge } from "../../src/knowledge.ts"
import { balanced, fold } from "../../src/layers.ts"
import { cn } from "../lib/ui.ts"
import type { Calls } from "../../src/calls.ts"
import type { Graph } from "../../src/graph.ts"
import type { Stats } from "../../src/model.ts"

const GRAINS: Grain[] = ["module", "file", "function"]
// a graph reads by its shape, so it gets most of the screen rather than a strip of it
const TALLEST = 0.78
// past this a layout is slower than anyone waits, so it is offered rather than run
const MOST = 9000
// heads on every wire stop reading as direction once they overlap
const HEADS = 2600
// the strip a module's name sits on, and the one part of it no node can cover
const STRIP = 13

const IMPORT = PAINT.down
const CALL = PAINT.loop
const PAINTS = ["module", "language", "size", "shape", "level", "kind", "one colour"]
const WIRED = ["kind", "module", "leaving"]
// green to red: bloated against its neighbours, not in the abstract
const ramp = (share: number) => `hsl(${Math.round(140 - 140 * share)}, 65%, 55%)`

/** a hue off the name, so a palette never runs out */
/** a band, spread across the wheel: an ordered thing wants ordered colours */
const banded = (at: number, of: number) =>
  `hsl(${Math.round((at / Math.max(1, of)) * 300)}, 62%, 55%)`

const hued = (name: string) => {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${hash}, 62%, 58%)`
}

const langOf = (file: string) => LANGS[file.split(".").pop()?.toLowerCase() ?? ""] ?? ""

export function Network({ stats }: { stats: Stats }) {
  const going = useGoing()
  const [read, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  // a picture somebody set up is the work: the grain, the colouring, every toggle and the
  // camera all outlive leaving for another tab, so coming back is coming back to it
  const [lang, setLang] = useKept("net.lang", "")
  const [calls, setCalls] = useState<Calls | null>(window.__DESPRAWL_CALLS__ ?? null)
  const [grain, setGrain] = useKept<Grain>("net.grain", "file")
  const [imports, setImports] = useKept("net.imports", false)
  const [wired, setWired] = useKept("net.calls", true)
  const [bounds, setBounds] = useKept("net.bounds", true)
  const [names, setNames] = useKept("net.names", true)
  const [find, setFind] = useKept("net.find", "")
  const [numbers, setNumbers] = useKept("net.numbers", false)
  const [bundle, setBundle] = useKept("net.bundle", false)
  const [paint, setPaint] = useKept("net.paint", "")
  const [edges, setEdges] = useKept("net.edges", WIRED[0])
  const [only, setOnly] = useKept("net.only", "")
  const [near, setNear] = useState<Spot | null>(null)
  const [go, setGo] = useState(false)
  const [moves, setMoves] = useKept("net.moves", true)
  const [plan, setPlan] = useKept("net.plan", false)

  const board = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const view = useRef(
    recall<{ scale: number; x: number; y: number }>("net.camera") ?? { scale: 1, x: 0, y: 0 },
  )
  const drag = useRef<{ x: number; y: number } | null>(null)
  // one finger drags, two pinch: the canvas takes the touch itself, so without these a
  // phone can only look at the picture
  const fingers = useRef<{ x: number; y: number; away: number } | null>(null)
  const [wide, setWide] = useState(900)
  const [tall, setTall] = useState(640)

  useEffect(() => {
    if (!graph) void importGraph().then(setGraph)
    if (!calls) void callGraph().then(setCalls)
  }, [])

  // js and ts are one language written two ways, so a repo of both is not multi language
  const multi = (held: string[]) => held.filter((one) => one !== "ts").length > 0 && held.length > 1
  const langs = useMemo(
    () =>
      [
        ...new Set(
          Object.values(read?.modules ?? {})
            .map((m) => m.lang)
            .filter(Boolean),
        ),
      ].sort(),
    [read],
  )
  const graph = useMemo(() => (read && lang ? onlyIn(read, lang) : read), [read, lang])
  useEffect(() => {
    const measure = () => {
      setWide(frame.current?.clientWidth ?? 900)
      // the layout viewport, not innerHeight: a phone reports the taller visual one and
      // the picture ends up longer than the screen it is being read on
      setTall(Math.max(420, Math.round(document.documentElement.clientHeight * TALLEST)))
    }
    measure()
    addEventListener("resize", measure)
    return () => removeEventListener("resize", measure)
  }, [graph])

  const split = useMemo(() => (graph ? balanced(graph) : null), [graph])
  const layout = useMemo(() => (graph && split ? fold(graph, split) : null), [graph, split])
  const called = useMemo(() => (layout ? namesOf(layout.units) : new Map()), [layout])

  const size =
    grain === "function"
      ? Object.values(calls?.symbols ?? {}).filter((s) => s.kind !== "module").length
      : grain === "file"
        ? Object.keys(graph?.modules ?? {}).length
        : (layout?.units.length ?? 0)
  const heavy = size > MOST && !go

  const drawn: Net | null = useMemo(
    () =>
      layout && graph && split && !heavy
        ? net(layout, graph, calls, grain, split, wide - 24, tall, !bounds)
        : null,
    [layout, graph, split, calls, grain, wide, tall, heavy, bounds],
  )

  // drawing is not a render: a wheel turn through react repaints the page to move
  // a camera, and every one of them waits for the frame after it
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
  const seats = useRef(new Map<string, { x: number; y: number }>())
  // whether the camera is where the reader put it, or still where it was opened
  const touched = useRef(recall<boolean>("net.touched") ?? false)
  const framed = useRef(recall<{ w: number; h: number }>("net.framed") ?? { w: 0, h: 0 })
  // written on the way out, so the next mount opens on the same corner of the same picture
  useEffect(
    () => () => {
      keep("net.camera", view.current)
      keep("net.touched", touched.current)
      keep("net.framed", framed.current)
    },
    [],
  )
  const moving = useRef<{ from: Map<string, { x: number; y: number }>; at: number } | null>(null)

  // a fresh picture opens whole: hunting for it loses the shape
  const whole = () => {
    const scale = drawn
      ? Math.min(1.6, (wide - 24) / Math.max(1, drawn.width), tall / Math.max(1, drawn.height))
      : 1
    view.current = {
      scale,
      x: (wide - 24 - (drawn?.width ?? 0) * scale) / 2,
      y: (tall - (drawn?.height ?? 0) * scale) / 2,
    }
    touched.current = false
    schedule()
  }
  useEffect(() => {
    if (!drawn) return
    setNear(null)
    // the nodes walk to where they now are, so a grain change is followed
    if (moves && seats.current.size) moving.current = { from: seats.current, at: performance.now() }
    // zoomed in, the same corner is wanted at the next grain: kept as a share, since the
    // next drawing is a new size
    // a chosen module is what the next grain frames
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
        x: ((wide - 24) / 2 - x) / scale / was.w,
        y: (tall / 2 - y) / scale / was.h,
      }
      const next = scale * (was.w / Math.max(1, drawn.width))
      view.current = {
        scale: next,
        x: (wide - 24) / 2 - share.x * drawn.width * next,
        y: tall / 2 - share.y * drawn.height * next,
      }
      schedule()
    } else whole()
    framed.current = { w: drawn.width, h: drawn.height }
  }, [grain, drawn])

  // a chosen module fills the frame, which is the only way to read one at this size
  const zoomTo = (box: Box) => {
    const scale = Math.min(4, ((wide - 24) / box.w) * 0.92, (tall / box.h) * 0.92)
    view.current = {
      scale,
      x: (wide - 24) / 2 - (box.x + box.w / 2) * scale,
      y: tall / 2 - (box.y + box.h / 2) * scale,
    }
    schedule()
  }

  // arriving with something picked frames the module holding it and lights the very dot,
  // rather than opening the whole picture and leaving the reader to find it again
  useEffect(() => {
    const pick = going.at.pick
    if (!pick || !layout) return
    const unit = holds(
      pick,
      layout.units.map((u) => u.path),
    )
    if (unit) setOnly(unit)
    const path = pick.split("#")[0]
    if (isFile(path)) setFind(path.split("/").pop() ?? "")
    const box = unit ? drawn?.boxes.find((b) => b.id === unit) : null
    if (box) zoomTo(box)
  }, [going.at.pick, layout, drawn])

  const units = useMemo(() => new Map((layout?.units ?? []).map((u) => [u.path, u])), [layout])
  const where = useMemo(() => worked(stats.tree), [stats.tree])
  const owner = (path: string) => hands(path, where, stats.contributors)[0]?.who.name ?? ""
  // what everything here is measured against, so a big file is big for this repo
  // the deepest level any unit sits at, so the band is spread over the range in hand
  const deepest = useMemo(
    () => Math.max(1, ...(layout?.units ?? []).map((one) => one.level)),
    [layout],
  )
  const biggest = useMemo(
    () => Math.max(1, ...(drawn?.spots ?? []).map((s) => Math.log1p(s.weight))),
    [drawn],
  )
  const boxAt = useMemo(() => new Map((drawn?.boxes ?? []).map((b) => [b.id, b])), [drawn])
  const unitOf = (spot: Spot) =>
    grain === "function" ? (boxAt.get(spot.box)?.parent ?? spot.box) : spot.box
  const fileOf = (spot: Spot) => (grain === "function" ? spot.box : spot.id)
  /** what a file is for, which is the only kind a file has */
  const sortOf = (file: string) =>
    graph?.modules[file]?.barrel
      ? "barrel"
      : /(^|\/)(tests?|__tests__)\/|\.(test|spec)\./.test(file)
        ? "test"
        : "source"
  // said once the graph is read: several languages want telling apart, one wants its shape
  const painted = paint || (multi(langs) ? "language" : "shape")

  const colourOf = (spot: Spot) => {
    if (painted === "one colour") return null
    if (painted === "language") {
      const brand = BRANDS[langOf(fileOf(spot))]
      return brand ? `#${brand[0]}` : null
    }
    if (painted === "kind") return hued(grain === "file" ? sortOf(spot.id) : spot.kind)
    if (painted === "size") return ramp(Math.log1p(spot.weight) / biggest)
    if (painted === "shape") {
      const unit = units.get(grain === "module" ? spot.id : unitOf(spot))
      if (!unit) return null
      const out = Object.values(unit.out).reduce((sum, n) => sum + n, 0)
      const into = Object.values(unit.in).reduce((sum, n) => sum + n, 0)
      return hued(shapeOf(unit.internal, out, into, Object.keys(unit.out).length).label)
    }
    if (painted === "level") {
      const at = units.get(grain === "module" ? spot.id : unitOf(spot))?.level ?? 0
      return banded(at, deepest)
    }
    return hued(grain === "module" ? spot.id : unitOf(spot))
  }

  // every colour on screen, once, in the order the eye meets them
  const legend = useMemo(() => {
    if (!drawn || painted === "one colour") return []
    const seen = new Map<string, string | null>()
    for (const spot of drawn.spots) {
      const label =
        painted === "language"
          ? (langOf(fileOf(spot)) ?? "")
          : painted === "kind"
            ? grain === "file"
              ? sortOf(spot.id)
              : spot.kind
            : painted === "level"
              ? `L${units.get(grain === "module" ? spot.id : unitOf(spot))?.level ?? 0}`
              : painted === "module"
                ? (called.get(grain === "module" ? spot.id : unitOf(spot)) ?? "")
                : ""
      if (!label || seen.has(label)) continue
      seen.set(label, colourOf(spot))
    }
    // size is a ramp, not a set of names, so it says its two ends instead
    if (painted === "size")
      return [
        { label: "smaller", colour: ramp(0) },
        { label: "bigger", colour: ramp(1) },
      ]
    if (painted === "shape")
      for (const spot of drawn.spots) {
        const unit = units.get(grain === "module" ? spot.id : unitOf(spot))
        if (!unit) continue
        const out = Object.values(unit.out).reduce((sum, v) => sum + v, 0)
        const into = Object.values(unit.in).reduce((sum, v) => sum + v, 0)
        const label = shapeOf(unit.internal, out, into, Object.keys(unit.out).length).label
        if (!seen.has(label)) seen.set(label, colourOf(spot))
      }
    return [...seen].slice(0, 14).map(([label, colour]) => ({ label, colour }))
  }, [drawn, paint, grain, units, called])

  const hunted = find.trim().toLowerCase()
  const at = useMemo(() => new Map((drawn?.spots ?? []).map((s) => [s.id, s])), [drawn])

  // react listens passively, so preventDefault there is ignored
  // under the cursor. The zoom has to own the wheel, which means binding it by hand
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

  const render = () => {
    const canvas = board.current
    if (!canvas || !drawn) return
    const pen = fit(canvas, wide - 24, tall)
    if (!pen) return
    const { scale, x, y } = view.current
    pen.clearRect(0, 0, wide, tall)
    pen.save()
    pen.translate(x, y)
    pen.scale(scale, scale)

    const now = performance.now()
    const walk = moving.current
    const step = walk ? Math.min(1, (now - walk.at) / 500) : 1
    // slow out: settling rather than stopping dead is what reads as movement
    const eased = 1 - (1 - step) ** 3
    const seat = (spot: Spot) => {
      const was = step < 1 && walk ? walk.from.get(spot.id) : undefined
      if (!was) return spot
      return { x: was.x + (spot.x - was.x) * eased, y: was.y + (spot.y - was.y) * eased }
    }
    const rough = step < 1 || now < busy.current
    const text = (base: number) => (base * scale ** 0.35) / scale

    // where a wire ends: a spot at this grain, or the box standing in for a file
    const where = (id: string) => {
      const spot = at.get(id)
      if (spot) return { ...seat(spot), r: spot.r }
      const box = boxAt.get(id)
      return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2, r: 0 } : null
    }

    if (bounds)
      for (const box of drawn.boxes) {
        const picked = box.id === only
        if (box.depth === 0) {
          // said once down the side: a box per module is a line to look past
          pen.setLineDash([])
          pen.fillStyle = `rgba(${PAINT.quiet}, 0.55)`
          pen.font = `${text(12)}px ui-sans-serif, system-ui, sans-serif`
          pen.fillText(box.label.replace("level ", "L"), box.x + 2, box.y + text(12))
          continue
        }
        if (plan && box.depth === 1) {
          const unit = units.get(box.id)
          pen.setLineDash([])
          pen.fillStyle = `rgba(${PAINT.quiet}, 0.09)`
          pen.fillRect(box.x, box.y, box.w, box.h)
          pen.strokeStyle = picked ? `rgba(${PAINT.down}, 0.9)` : `rgba(${PAINT.quiet}, 0.5)`
          pen.lineWidth = (picked ? 2 : 1) / scale
          pen.strokeRect(box.x, box.y, box.w, box.h)
          if (unit) {
            const out = Object.values(unit.out).reduce((sum, n) => sum + n, 0)
            const into = Object.values(unit.in).reduce((sum, n) => sum + n, 0)
            const shape = shapeOf(unit.internal, out, into, Object.keys(unit.out).length)
            const said = [
              [called.get(box.id) ?? box.label, 15, 0.95],
              [`${num(unit.files)} files · ${num(unit.lines)} loc · L${unit.level}`, 11, 0.6],
              [shape.label, 11, 0.6],
              [owner(box.id) && `mostly ${owner(box.id)}`, 11, 0.45],
            ] as [string, number, number][]
            let line = box.y + text(16)
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
          : `rgba(${PAINT.quiet}, ${box.depth === 1 ? 0.4 : 0.24})`
        pen.lineWidth = (picked ? 2 : 1) / scale
        pen.strokeRect(box.x, box.y, box.w, box.h)
        // its own strip, so there is always somewhere to click
        if (box.depth === 1) {
          pen.setLineDash([])
          pen.fillStyle = `rgba(${picked ? PAINT.down : PAINT.quiet}, ${picked ? 0.22 : 0.1})`
          pen.fillRect(box.x, box.y, box.w, STRIP)
        }
        if (names && box.depth > 0 && box.w * scale > 46) {
          pen.setLineDash([])
          pen.fillStyle = `rgba(${PAINT.quiet}, 0.75)`
          pen.font = `${text(box.depth === 1 ? 14 : 11)}px ui-sans-serif, system-ui, sans-serif`
          const held = drawn.spots.filter((s) => s.box === box.id).length
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
      return grain === "function" ? (boxAt.get(spot.box)?.parent ?? spot.box) : spot.box
    }
    const chosen = (id: string) => !only || unitOfSpot(id) === only || id === only

    const lit = near ? new Set([near.id]) : null
    const touching = new Set<string>()
    if (near)
      for (const wire of drawn.wires) {
        if (wire.from === near.id) touching.add(wire.to)
        if (wire.to === near.id) touching.add(wire.from)
      }

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
    const shown =
      bundle || plan
        ? [
            ...drawn.wires
              .reduce((held, wire) => {
                const a = unitOfSpot(wire.from)
                const b = unitOfSpot(wire.to)
                const key = a === b ? `${wire.from} ${wire.to}` : `${a} ${b}`
                const found = held.get(key) ?? {
                  from: a === b ? wire.from : a,
                  to: a === b ? wire.to : b,
                  imports: 0,
                  calls: 0,
                  types: true,
                  held: 0,
                }
                found.imports += wire.imports
                found.calls += wire.calls
                found.held++
                if (!wire.types) found.types = false
                return held.set(key, found)
              }, new Map<string, Wire & { held: number }>())
              .values(),
          ]
        : drawn.wires.map((wire) => ({ ...wire, held: 1 }))

    for (const wire of shown) {
      // no dots here, so a line staying inside one has nothing to join
      if (plan && unitOfSpot(wire.from) === unitOfSpot(wire.to)) continue
      const from = where(wire.from)
      const to = where(wire.to)
      if (!from || !to) continue
      const quiet =
        (lit && !lit.has(wire.from) && !lit.has(wire.to)) ||
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
      for (const [weight, colour, bow] of kinds) {
        // heavier pairs read darker, in a few steps so the batching survives it
        const heft = Math.min(1, weight / 6)
        const alpha = quiet ? 0.03 : lit ? 0.85 : wire.types ? 0.13 : 0.22 + 0.3 * heft
        const key = `${tint ?? colour} ${alpha.toFixed(2)}`
        const { line, head } = draw(key)
        styles.set(key, tint ? fade(tint, alpha) : ink(colour, alpha))
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
        if (!rough && (shown.length <= HEADS || lit)) {
          // the head sits where the curve arrives
          const ax = to.x - cx
          const ay = to.y - cy
          const long = Math.hypot(ax, ay) || 1
          const tipX = to.x - (ax / long) * (to.r + 1)
          const tipY = to.y - (ay / long) * (to.r + 1)
          // sized on screen like its line, or zoom grows fans instead of arrows
          const back = 5 / scale
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
      }
    }
    for (const [key, path] of lines) {
      pen.strokeStyle = styles.get(key)!
      pen.lineWidth = (bundle ? 1.6 : 1) / scale
      pen.stroke(path)
      pen.fillStyle = styles.get(key)!
      pen.fill(heads.get(key)!)
    }

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

    if (!plan)
      for (const spot of drawn.spots) {
        const hit =
          hunted &&
          (spot.label.toLowerCase().includes(hunted) || spot.id.toLowerCase().includes(hunted))
        const quiet =
          (lit && !lit.has(spot.id) && !touching.has(spot.id)) ||
          (hunted && !hit) ||
          !chosen(spot.id)
        const own = colourOf(spot)
        const now = seat(spot)
        pen.globalAlpha = quiet ? 0.16 : lit?.has(spot.id) ? 1 : 0.9
        pen.fillStyle = hit ? `rgba(${PAINT.cut}, 0.95)` : (own ?? `rgb(${plain()})`)
        pen.beginPath()
        pen.arc(now.x, now.y, spot.r + (lit?.has(spot.id) ? 2 : 0), 0, Math.PI * 2)
        pen.fill()
        pen.globalAlpha = 1
      }

    if (names && !rough && !plan)
      for (const spot of drawn.spots) {
        // every dot named at once is a wall of text, so a name waits for the zoom that
        // fits it, and is sized against the screen rather than the graph
        if (!lit?.has(spot.id) && spot.r * scale < 4.5) continue
        pen.fillStyle = `rgba(${PAINT.quiet}, 0.8)`
        pen.font = `${text(13)}px ui-sans-serif, system-ui, sans-serif`
        const put = seat(spot)
        pen.fillText(shortPath(spot.label, 18), put.x + spot.r + 3, put.y + 4)
      }
    pen.restore()

    // where everything ended up, so the next arrangement knows where to walk from
    seats.current = new Map(drawn.spots.map((spot) => [spot.id, seat(spot)]))
    // one frame more while moving, and one after to put the detail back
    if (step < 1) schedule()
    else if (rough) setTimeout(schedule, 150)
    else moving.current = null
  }

  // the newest closure is the one a frame should run, and every render asks for one
  drawing.current = render
  useEffect(schedule)

  /** the smallest box under the cursor, and whether the cursor is on its name */
  const boxUnder = (px: number, py: number, strip = false) => {
    if (!drawn) return null
    const { scale, x, y } = view.current
    const gx = (px - x) / scale
    const gy = (py - y) / scale
    return (
      drawn.boxes
        .filter(
          (b) =>
            b.depth === 1 &&
            gx >= b.x &&
            gx <= b.x + b.w &&
            gy >= b.y &&
            gy <= b.y + (strip ? STRIP : b.h),
        )
        .sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null
    )
  }

  /** the midpoint of whatever is touching, and how far apart two fingers are */
  const touching = (event: React.TouchEvent) => {
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

  const spotAt = (px: number, py: number) => {
    if (!drawn) return null
    const { scale, x, y } = view.current
    const gx = (px - x) / scale
    const gy = (py - y) / scale
    let best: Spot | null = null
    let close = 14 / scale
    for (const spot of drawn.spots) {
      const away = Math.hypot(spot.x - gx, spot.y - gy)
      if (away < close + spot.r) {
        close = away
        best = spot
      }
    }
    return best
  }

  if (!graph) return <Loading stats={stats} current="Graph" what="Reading every import," rows={5} />

  // a dot is a file, a declaration or a whole group depending on the grain, and each of
  // those is worth reading, framing and opening: the click says which rather than picking
  const walk = (spot: Spot) =>
    going.open(
      grain === "function"
        ? symbol(spot.id, undefined, `declared in ${spot.box}`)
        : grain === "file"
          ? asFile(spot.id, `${plural(spot.weight, "line")}`)
          : asGroup(spot.id, called.get(spot.id)),
    )

  const toggle = (on: boolean, set: (next: boolean) => void, label: string, tone?: string) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => set(!on)}
      className={cn("gap-1.5", !on && "text-muted-foreground opacity-60")}
    >
      {tone && (
        <span
          className="size-2 rounded-full"
          style={{ background: `rgb(${tone})`, opacity: on ? 1 : 0.4 }}
        />
      )}
      {label}
    </Button>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Back />
        <Save
          className="ml-auto"
          name="graph"
          picture={() => board.current}
          rows={() => [
            ["from", "to", "imports", "calls", "type only"],
            ...(drawn?.wires ?? []).map((w) => [w.from, w.to, w.imports, w.calls, String(w.types)]),
          ]}
          note={`${plural(drawn?.wires.length ?? 0, "link")} between ${plural(drawn?.spots.length ?? 0, "node")}, as`}
          extra={
            graph && layout && split
              ? [
                  {
                    name: "knowledge-graph",
                    label: "Knowledge graph",
                    note: "every module, file, declaration and install, and what relates them, at this grain, as",
                    rows: () => asRows(knowledge(stats.repo, graph, calls, layout, grain, split)),
                  },
                ]
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs tabs={GRAINS} value={grain} onChange={(next) => setGrain(next as Grain)} />
        {langs.length > 1 && (
          <Tabs
            tabs={["every language", ...langs]}
            value={lang || "every language"}
            onChange={(next) => setLang(next === "every language" ? "" : next)}
          />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {toggle(imports, setImports, "imports", IMPORT)}
          {toggle(wired, setWired, "calls", CALL)}
          {toggle(bounds, setBounds, "bounds")}
          <Menu title="What to draw">
            <MenuSection
              label="Colour by"
              hint="language reads off the extension, module off the folder it was grouped into"
            >
              <div className="flex flex-col">
                {PAINTS.map((one) => (
                  <button
                    key={one}
                    onClick={() => setPaint(one)}
                    className={cn(
                      "hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                      one === paint ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="w-3">{one === paint ? "✓" : ""}</span>
                    {one}
                  </button>
                ))}
              </div>
            </MenuSection>
            <MenuSection
              label="Colour lines by"
              hint="module takes the colour of the one it leaves, leaving greys out everything that stays inside one"
            >
              <div className="flex flex-col">
                {WIRED.map((one) => (
                  <button
                    key={one}
                    onClick={() => setEdges(one)}
                    className={cn(
                      "hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                      one === edges ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="w-3">{one === edges ? "\u2713" : ""}</span>
                    {one}
                  </button>
                ))}
              </div>
            </MenuSection>
            <MenuSection label="Show">
              <div className="flex flex-wrap gap-1">
                {toggle(names, setNames, "labels")}
                {toggle(numbers, setNumbers, "numbers")}
                {toggle(bundle, setBundle, "bundle")}
                {toggle(moves, setMoves, "motion")}
                {toggle(plan, setPlan, "architecture")}
              </div>
            </MenuSection>
          </Menu>
          <Input
            value={find}
            onChange={(event) => setFind(event.target.value)}
            placeholder="Find"
            className="w-32"
          />
        </div>
      </div>

      <Section id="network_graph" className="flex flex-col gap-4">
        <Card>
          <CardHead
            title="Graph"
            hint={
              !bounds
                ? "no bounds, so the whole graph arranges itself and the modules show as colour"
                : grain === "module"
                  ? "every module a dot, sitting on the level its imports put it on"
                  : grain === "file"
                    ? "every file a dot, bounded by the module holding it"
                    : "every declaration a dot, bounded by its file, bounded by its module"
            }
            wrap
          >
            <div className="ml-auto flex items-center gap-1">
              {only && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOnly("")
                    // the pick came from another tab, and leaving it set would frame this
                    // again the moment the reader stepped away and back
                    if (going.at.pick) going.go({ pick: "" })
                    whole()
                  }}
                >
                  {called.get(only) ?? only} ✕
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={whole}>
                fit
              </Button>
            </div>
          </CardHead>
          <CardContent>
            {/* what the colours mean, said where the drawing is rather than in a menu */}
            {!!drawn && (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {legend.map((one) => (
                  <span key={one.label} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{ background: one.colour ?? "var(--muted-foreground)" }}
                    />
                    <span className="text-muted-foreground">{one.label}</span>
                  </span>
                ))}
              </div>
            )}
            <div ref={frame} className="w-full">
              {heavy ? (
                <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-3 text-sm">
                  <span>
                    {num(size)} nodes at this grain. Laying that out takes a while, and reading it
                    takes longer.
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setGo(true)}>
                    draw it anyway
                  </Button>
                </div>
              ) : (
                <canvas
                  ref={board}
                  className="block cursor-crosshair touch-none select-none"
                  onMouseDown={(event) => {
                    drag.current = { x: event.clientX, y: event.clientY }
                  }}
                  onTouchStart={(event) => {
                    const now = touching(event)
                    fingers.current = now
                    // a tap has no hover before it, and the caption and the click both
                    // read what is under the cursor
                    if (now && event.touches.length === 1) setNear(spotAt(now.x, now.y))
                  }}
                  onTouchMove={(event) => {
                    const now = touching(event)
                    const was = fingers.current
                    fingers.current = now
                    if (!now || !was) return
                    // both fingers still down: the gap between them is the zoom, and the
                    // point between them is what stays put while it changes
                    if (now.away && was.away) {
                      const next = Math.min(
                        8,
                        Math.max(0.2, (view.current.scale * now.away) / was.away),
                      )
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
                  }}
                  onTouchEnd={(event) => {
                    // lifting one of two leaves the other mid gesture, so it starts again
                    fingers.current = event.touches.length ? touching(event) : null
                  }}
                  onMouseUp={() => {
                    drag.current = null
                  }}
                  onMouseLeave={() => {
                    drag.current = null
                    setNear(null)
                  }}
                  onMouseMove={(event) => {
                    const box = board.current!.getBoundingClientRect()
                    if (drag.current) {
                      view.current.x += event.clientX - drag.current.x
                      view.current.y += event.clientY - drag.current.y
                      drag.current = { x: event.clientX, y: event.clientY }
                      return rushed()
                    }
                    const found = spotAt(event.clientX - box.left, event.clientY - box.top)
                    if (found?.id !== near?.id) setNear(found)
                  }}
                  onClick={(event) => {
                    const box = board.current!.getBoundingClientRect()
                    const px = event.clientX - box.left
                    const py = event.clientY - box.top
                    // its name is always the module, whatever sits under the rest of it
                    const named = boxUnder(px, py, true)
                    const under = named ?? (near ? null : boxUnder(px, py))
                    if (!under) return near ? walk(near) : setOnly("")
                    const same = under.id === only
                    setOnly(same ? "" : under.id)
                    if (same) whole()
                    else zoomTo(under)
                  }}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* fixed height: a caption that grows on hover moves the graph under the cursor */}
        <p className="text-muted-foreground min-h-10 text-xs">
          {near ? (
            <>
              <span className="text-foreground font-mono">{near.label}</span>
              {near.box && <> in {called.get(near.box) ?? near.box}</>} ·{" "}
              {plural(near.weight, "line")} ·{" "}
              {plural((drawn?.wires ?? []).filter((w) => w.from === near.id).length, "link")} out,{" "}
              {(drawn?.wires ?? []).filter((w) => w.to === near.id).length} in · click to read it or
              follow it
            </>
          ) : drawn ? (
            <>
              {plural(drawn.spots.length, "node")} and {plural(drawn.wires.length, "link")},{" "}
              {bounds
                ? "each inside the module holding it, click a module name to keep only it"
                : "arranged loose, since bounds are off"}
              . Drag or one finger to move, wheel or pinch to zoom, hover to keep only what one
              touches. An import bows one way and a call the other, so a pair with both shows both.
              A faint line is a type only import, and{" "}
              {drawn.wires.length > HEADS
                ? "arrows are drawn on hover only at this size"
                : "the arrow sits at the end it arrives at"}
              .{" "}
              {drawn.passes < 60 &&
                `Laid out in ${drawn.passes} passes, fewer than usual for size.`}
            </>
          ) : (
            "Nothing to draw yet."
          )}
        </p>
      </Section>

      <Onward stats={stats} current="Graph" />
    </div>
  )
}
