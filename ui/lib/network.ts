// owner: finn
// goal: lay a graph out inside its own boxes, so nothing drifts out of the module holding it

import { unitOf, type Layout } from "../../src/layers.ts"
import type { Calls } from "../../src/calls.ts"
import type { Graph } from "../../src/graph.ts"

import type { Grain } from "../../src/knowledge.ts"
export type { Grain }

export interface Spot {
  id: string
  label: string
  /** the innermost box holding it, "" at module grain */
  box: string
  /** its own size, which is what the dot is scaled by */
  weight: number
  kind: string
  x: number
  y: number
  r: number
}

export interface Box {
  id: string
  label: string
  /** the box holding this one, "" for a level band */
  parent: string
  depth: number
  x: number
  y: number
  w: number
  h: number
}

export interface Wire {
  from: string
  to: string
  /** how many imports and how many calls run this way, either can be 0 */
  imports: number
  calls: number
  /** every import of it is erased by the build */
  types: boolean
}

export interface Net {
  spots: Spot[]
  boxes: Box[]
  wires: Wire[]
  width: number
  height: number
  /** passes it could afford, so a slow layout says so rather than hanging */
  passes: number
}

const PAD = 14
const GAP = 10
// room per node, which is what decides how big the box holding it has to be
const ROW = 30
// a repo big enough to need fewer passes gets fewer, and the panel says it did
const BUDGET = 900_000

const rounded = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n)))

/** shelf packing: left to right, wrapping past the width given */
function pack(sizes: { w: number; h: number }[], want: number) {
  const places: { x: number; y: number }[] = []
  let x = PAD
  let y = PAD
  let tall = 0
  let wide = 0
  for (const size of sizes) {
    if (x > PAD && x + size.w > want) {
      x = PAD
      y += tall + GAP
      tall = 0
    }
    places.push({ x, y })
    x += size.w + GAP
    tall = Math.max(tall, size.h)
    wide = Math.max(wide, x - GAP)
  }
  return { places, w: Math.max(wide + PAD, 2 * PAD), h: y + tall + PAD }
}

/**
 * A few passes of push and pull, clamped to the box every time: a spot leaves its module
 * only by being put in another one. `lean` is where its outside neighbours sit, which is
 * what pulls a file to the edge nearest what it imports.
 */
function settle(
  spots: Spot[],
  pulls: [number, number][],
  lean: Map<string, { x: number; y: number }>,
  box: { x: number; y: number; w: number; h: number },
  passes: number,
) {
  if (spots.length < 2) {
    for (const spot of spots) {
      spot.x = box.x + box.w / 2
      spot.y = box.y + box.h / 2
    }
    return
  }
  const middle = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  // where it starts, not where it is pushed: a lasting pull would flatten every spot
  // against the wall nearest what it imports, which is a line and not a layout
  spots.forEach((spot, i) => {
    const angle = (i / spots.length) * Math.PI * 2
    const to = lean.get(spot.id)
    const away = to ? Math.hypot(to.x - middle.x, to.y - middle.y) || 1 : 1
    spot.x =
      middle.x + (to ? ((to.x - middle.x) / away) * box.w * 0.3 : 0) + (Math.cos(angle) * box.w) / 5
    spot.y =
      middle.y + (to ? ((to.y - middle.y) / away) * box.h * 0.3 : 0) + (Math.sin(angle) * box.h) / 5
  })
  const room = Math.sqrt((box.w * box.h) / spots.length)
  for (let pass = 0; pass < passes; pass++) {
    const heat = 1 - pass / passes
    for (let i = 0; i < spots.length; i++) {
      const one = spots[i]
      let dx = 0
      let dy = 0
      for (let j = 0; j < spots.length; j++) {
        if (i === j) continue
        const other = spots[j]
        const ax = one.x - other.x
        const ay = one.y - other.y
        const away = Math.hypot(ax, ay) || 0.01
        if (away > room * 2) continue
        const push = (room - away) / away
        if (push > 0) {
          dx += ax * push * 0.5
          dy += ay * push * 0.5
        }
      }
      one.x += dx * heat
      one.y += dy * heat
    }
    for (const [a, b] of pulls) {
      const one = spots[a]
      const two = spots[b]
      const mx = (two.x - one.x) * 0.04 * heat
      const my = (two.y - one.y) * 0.04 * heat
      one.x += mx
      one.y += my
      two.x -= mx
      two.y -= my
    }
    for (const spot of spots) {
      spot.x = Math.min(box.x + box.w - spot.r - 2, Math.max(box.x + spot.r + 2, spot.x))
      spot.y = Math.min(box.y + box.h - spot.r - 2, Math.max(box.y + spot.r + 2, spot.y))
    }
  }
}

/** no boxes: repulsion off a grid, or a thousand files is a million sums a pass */
function loose(
  spots: Spot[],
  pulls: [number, number][],
  wide: number,
  tall: number,
  passes: number,
) {
  const room = Math.sqrt((wide * tall) / Math.max(1, spots.length))
  const middle = { x: wide / 2, y: tall / 2 }
  spots.forEach((spot, i) => {
    // a spiral, not a ring: a thousand on one circle take a hundred passes to fill
    const turn = i * 2.4
    const out = Math.sqrt(i / spots.length) * Math.min(wide, tall) * 0.45
    spot.x = middle.x + Math.cos(turn) * out
    spot.y = middle.y + Math.sin(turn) * out
  })
  for (let pass = 0; pass < passes; pass++) {
    const heat = 1 - pass / passes
    const cells = new Map<string, number[]>()
    const cell = (x: number, y: number) => `${Math.floor(x / room)} ${Math.floor(y / room)}`
    spots.forEach((spot, i) => {
      const key = cell(spot.x, spot.y)
      cells.set(key, [...(cells.get(key) ?? []), i])
    })
    for (let i = 0; i < spots.length; i++) {
      const one = spots[i]
      let dx = 0
      let dy = 0
      const cx = Math.floor(one.x / room)
      const cy = Math.floor(one.y / room)
      for (let ax = -1; ax <= 1; ax++)
        for (let ay = -1; ay <= 1; ay++)
          for (const j of cells.get(`${cx + ax} ${cy + ay}`) ?? []) {
            if (i === j) continue
            const other = spots[j]
            const ox = one.x - other.x
            const oy = one.y - other.y
            const away = Math.hypot(ox, oy) || 0.01
            const push = (room - away) / away
            if (push > 0) {
              dx += ox * push * 0.5
              dy += oy * push * 0.5
            }
          }
      // held in frame, since nothing else stops a leaf drifting off the edge for good
      dx += (middle.x - one.x) * 0.002
      dy += (middle.y - one.y) * 0.002
      one.x += dx * heat
      one.y += dy * heat
    }
    // shared by every wire on it, or a hub drags half the repo onto its own dot
    for (const [a, b] of pulls) {
      const one = spots[a]
      const two = spots[b]
      const mx = (two.x - one.x) * 0.008 * heat
      const my = (two.y - one.y) * 0.008 * heat
      one.x += mx
      one.y += my
      two.x -= mx
      two.y -= my
    }
  }
}

/** every file that is its own node, and the box it belongs to at this grain */
const members = (graph: Graph, calls: Calls | null, grain: Grain) =>
  grain === "function"
    ? Object.values(calls?.symbols ?? {})
        .filter((s) => s.kind !== "module" && graph.modules[s.file])
        .map((s) => ({ id: s.id, label: s.name, file: s.file, weight: s.lines, kind: s.kind }))
    : Object.values(graph.modules).map((m) => ({
        id: m.path,
        label: m.path.split("/").pop() ?? m.path,
        file: m.path,
        weight: m.lines,
        kind: "file",
      }))

/**
 * Import and call edges between whatever the nodes are, merged so one pair is one wire.
 * At function grain an import still runs between two files, which are boxes there, so an
 * end of a wire can be a box as easily as a spot.
 */
function wires(
  graph: Graph,
  calls: Calls | null,
  grain: Grain,
  of: (file: string) => string,
  live: Set<string>,
): Wire[] {
  const found = new Map<string, Wire>()
  const add = (from: string, to: string, kind: "imports" | "calls", type: boolean) => {
    if (from === to || !live.has(from) || !live.has(to)) return
    const key = `${from} ${to}`
    const wire = found.get(key) ?? { from, to, imports: 0, calls: 0, types: true }
    wire[kind]++
    if (!type) wire.types = false
    found.set(key, wire)
  }
  for (const module of Object.values(graph.modules))
    for (const edge of module.out) add(of(module.path), of(edge.to), "imports", edge.type)
  for (const symbol of Object.values(calls?.symbols ?? {}))
    for (const target of symbol.calls) {
      const other = calls?.symbols[target]
      if (!other) continue
      if (grain === "function") add(symbol.id, target, "calls", false)
      else add(of(symbol.file), of(other.file), "calls", false)
    }
  return [...found.values()]
}

/**
 * Boxes hold spots, level bands hold boxes, and the whole thing is sized before anything
 * is placed: a container cannot bound what it was drawn around.
 */
export function net(
  layout: Layout,
  graph: Graph,
  calls: Calls | null,
  grain: Grain,
  split: number | Record<string, string>,
  width: number,
  tall: number,
  /** no boxes: one arrangement over the whole frame instead */
  free = false,
): Net {
  const unitAt = (path: string) =>
    typeof split === "number" ? unitOf(path, split) : (split[path] ?? unitOf(path, 1))
  const known = new Map(layout.units.map((u) => [u.path, u]))
  const langAt = new Map<string, string>()
  for (const one of layout.units) {
    const by = new Map<string, number>()
    for (const [path, module] of Object.entries(graph.modules))
      if (unitAt(path) === one.path && module.lang)
        by.set(module.lang, (by.get(module.lang) ?? 0) + 1)
    langAt.set(one.path, [...by].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "")
  }
  const held = members(graph, calls, grain).filter((one) => known.has(unitAt(one.file)))

  // module grain draws the unit itself, so the level band is the only box it needs
  const spots: Spot[] = (
    grain === "module"
      ? layout.units.map((u) => ({
          id: u.path,
          label: u.path,
          box: `L${u.level}`,
          weight: u.lines,
          kind: u.role,
          x: 0,
          y: 0,
          r: 0,
        }))
      : held.map((one) => ({
          id: one.id,
          label: one.label,
          box: grain === "function" ? one.file : unitAt(one.file),
          weight: one.weight,
          kind: one.kind,
          x: 0,
          y: 0,
          r: 0,
        }))
  ).map((spot) => ({ ...spot, r: Math.min(7, 2.5 + Math.sqrt(spot.weight) / 6) }))

  // a file is a node at file grain and a box at function grain, and either can hold a wire
  const live = new Set([...spots.map((s) => s.id), ...held.map((one) => one.file)])
  const wired = wires(
    graph,
    calls,
    grain,
    (file) => (grain === "module" ? unitAt(file) : file),
    live,
  )

  // nothing bounds it, so the whole picture arranges itself in the frame it was given
  if (free) {
    const seat = new Map(spots.map((s, i) => [s.id, i]))
    const pulls: [number, number][] = []
    for (const wire of wired) {
      const a = seat.get(wire.from)
      const b = seat.get(wire.to)
      if (a !== undefined && b !== undefined) pulls.push([a, b])
    }
    const room = Math.max(width, Math.sqrt(spots.length * ROW * ROW * 2.4 * (width / tall)))
    const deep = Math.max(tall, (room * tall) / width)
    const passes = Math.max(
      20,
      Math.min(220, Math.floor(2_400_000 / Math.max(1, spots.length * 12))),
    )
    loose(spots, pulls, room, deep, passes)
    return { spots, boxes: [], wires: wired, width: room, height: deep, passes }
  }

  // innermost boxes first: a file box is sized by what it holds, a unit box by its files
  const inner = new Map<string, Spot[]>()
  for (const spot of spots) inner.set(spot.box, [...(inner.get(spot.box) ?? []), spot])

  const boxes: Box[] = []
  const sized = new Map<string, { w: number; h: number }>()
  const kids = new Map<string, string[]>()

  if (grain === "function") {
    for (const [file, mine] of inner) {
      const side = rounded(mine.length) * ROW
      sized.set(file, { w: side + 2 * PAD, h: side + 2 * PAD + 12 })
      const unit = unitAt(file)
      kids.set(unit, [...(kids.get(unit) ?? []), file])
    }
  }

  // a file box never grows past the module box holding it, whatever it holds itself
  const fitted = (files: string[], room: number) =>
    files.map((file) => ({ w: Math.min(sized.get(file)!.w, room), h: sized.get(file)!.h }))

  // square pixels: ten times the files, ten times the room
  const load = (path: string) =>
    grain === "function"
      ? (kids.get(path) ?? []).reduce((sum, file) => {
          const size = sized.get(file)!
          return sum + size.w * size.h
        }, 0) * 1.3
      : (inner.get(path) ?? []).length * ROW * ROW

  // a level is a band, deepest at the top
  // the frame is wider than it is tall, so the layout is given that shape up front. Laying
  // out narrow and scaling to fit would leave the picture in a column with the sides empty
  const area = layout.units.reduce((sum, u) => sum + load(u.path), 0) * 1.35
  const wide = Math.max(width, Math.min(6000, Math.sqrt(Math.max(1, area) * (width / tall))))
  const per = Math.max(2, Math.min(8, Math.round(wide / 300)))
  const levels = [...new Set(layout.units.map((u) => u.level))].sort((a, b) => b - a)
  let y = 0
  for (const level of levels) {
    const band = `L${level}`
    const top = y
    const mine: Box[] = []
    if (grain === "module") {
      const held = (inner.get(band) ?? []).length
      y += Math.max(90, Math.min(460, (held * ROW * ROW) / (wide - 2 * PAD) + 24)) + GAP
    } else {
      // two languages cannot import each other, so a shelf that mixes them draws lines
      // across the picture that say nothing: each language keeps its own side
      const here = layout.units
        .filter((u) => u.level === level)
        .sort(
          (a, b) =>
            (langAt.get(a.path) ?? "").localeCompare(langAt.get(b.path) ?? "") ||
            a.path.localeCompare(b.path),
        )
      // a shelf never mixes two languages, so the columns stay one language wide
      const shelves: (typeof here)[] = []
      for (let from = 0; from < here.length;) {
        const lang = langAt.get(here[from].path) ?? ""
        let to = from
        while (to < here.length && to - from < per && (langAt.get(here[to].path) ?? "") === lang)
          to++
        shelves.push(here.slice(from, to))
        from = to
      }
      for (const shelf of shelves) {
        const weights = shelf.map((u) => Math.sqrt(Math.max(1, load(u.path))))
        const total = weights.reduce((sum, one) => sum + one, 0) || 1
        const room = wide - 2 * PAD - GAP * (shelf.length - 1)
        // its share of the shelf, but never wider than twice its own height: a letterbox
        // holding twenty files in a row says nothing a list would not have said
        const widths = shelf.map((unit, i) =>
          Math.max(
            120,
            Math.min((room * weights[i]) / total, Math.sqrt(Math.max(1, load(unit.path)) * 2.2)),
          ),
        )
        const spare = Math.max(0, room - widths.reduce((sum, one) => sum + one, 0))
        const step = spare / (shelf.length + 1)
        let x = PAD + step
        let tall = 0
        shelf.forEach((unit, i) => {
          const w = widths[i]
          const inside = kids.get(unit.path) ?? []
          const h =
            grain === "function"
              ? pack(fitted(inside, w - 2 * PAD), w - 2 * PAD).h + 14
              : Math.max(80, Math.min(460, load(unit.path) / w + 20))
          mine.push({ id: unit.path, label: unit.path, parent: band, depth: 1, x, y, w, h })
          x += w + GAP + step
          tall = Math.max(tall, h)
        })
        y += tall + GAP
      }
    }
    boxes.push({
      id: band,
      label: `level ${level}`,
      parent: "",
      depth: 0,
      x: PAD / 2,
      y: top,
      w: wide - PAD,
      h: Math.max(y - GAP - top, 40),
    })
    boxes.push(...mine)
  }

  // then the file boxes, inside the unit box that was just placed
  if (grain === "function")
    for (const box of boxes.filter((b) => b.depth === 1)) {
      const mine = kids.get(box.id) ?? []
      const room = fitted(mine, box.w - 2 * PAD)
      const packed = pack(room, box.w - 2 * PAD)
      mine.forEach((file, i) => {
        const size = room[i]
        const at = packed.places[i]
        boxes.push({
          id: file,
          label: file.split("/").pop() ?? file,
          parent: box.id,
          depth: 2,
          x: box.x + at.x,
          y: box.y + 14 + at.y,
          w: size.w,
          h: size.h,
        })
      })
    }

  // levels stack, so a deep repo grows past the frame and every fit shrinks it sideways to
  // nothing. Squashing the stack keeps the width, which is where the reading happens
  const squash = Math.max(0.75, Math.min(1, tall / Math.max(1, y)))
  if (squash < 1)
    for (const box of boxes) {
      box.y *= squash
      box.h *= squash
    }
  y *= squash

  const placed = new Map(boxes.map((b) => [b.id, b]))
  // a pass costs every pair in a box, so the budget decides how many
  const cost = [...inner.values()].reduce((sum, mine) => sum + mine.length * mine.length, 1)
  const passes = Math.max(12, Math.min(140, Math.floor(BUDGET / cost)))

  const at = new Map(spots.map((s) => [s.id, s]))
  const outside = new Map<string, { x: number; y: number }>()
  for (const wire of wired) {
    for (const [a, b] of [
      [wire.from, wire.to],
      [wire.to, wire.from],
    ]) {
      const mine = at.get(a)
      const other = at.get(b)
      if (!mine || !other || mine.box === other.box) continue
      const box = placed.get(other.box)
      if (!box) continue
      const was = outside.get(a) ?? { x: 0, y: 0 }
      // averaged, so a file leaning on two modules sits between them rather than at one
      outside.set(a, {
        x: was.x ? (was.x + box.x + box.w / 2) / 2 : box.x + box.w / 2,
        y: was.y ? (was.y + box.y + box.h / 2) / 2 : box.y + box.h / 2,
      })
    }
  }

  for (const [id, mine] of inner) {
    const box = placed.get(id)
    if (!box) continue
    const seat = new Map(mine.map((s, i) => [s.id, i]))
    const pulls: [number, number][] = []
    for (const wire of wired) {
      const a = seat.get(wire.from)
      const b = seat.get(wire.to)
      if (a !== undefined && b !== undefined && a !== b) pulls.push([a, b])
    }
    const room = {
      x: box.x,
      y: box.y + (box.depth ? 12 : 0),
      w: box.w,
      h: box.h - (box.depth ? 12 : 0),
    }
    settle(mine, pulls, outside, room, passes)
  }

  return {
    spots,
    boxes,
    wires: wired,
    width: Math.max(wide, width),
    height: Math.max(y, 200),
    passes,
  }
}
