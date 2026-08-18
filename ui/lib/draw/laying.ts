// owner: finn
// goal: one repo laid out in its own lane, band by band, shelf by shelf

import { pack, GAP, PAD } from "./packing.ts"
import type { Box } from "./network.ts"
import type { Grain } from "../../../src/facts/knowledge.ts"
import type { Unit } from "../../../src/read/layers.ts"

// a lane is drawn with a border, and the gap around it is that border's room
export const LANE = 28

export interface Laying {
  units: Unit[]
  /** how many lanes there are, since a single repo is not given one */
  lanes: number
  columns: string[]
  grain: Grain
  width: number
  tall: number
  langAt: Map<string, string>
  /** which way a module faces on the wire, -1 answers requests and 1 makes them */
  facing: Map<string, number>
  /** the pixels a unit wants, square */
  load: (path: string) => number
  kids: Map<string, string[]>
  fitted: (files: string[], room: number) => { w: number; h: number }[]
  repoOf: (path: string) => string
}

export interface Lane {
  column: string
  wide: number
  deep: number
  boxes: Box[]
}

export function lanesOf(what: Laying): Lane[] {
  const { units, lanes, columns, grain, width, tall, langAt, facing, load, kids, fitted, repoOf } =
    what

  // a level is a band, deepest at the top
  const areaOf = (held: typeof units) => held.reduce((sum, u) => sum + load(u.path), 0) * 1.35
  // a lane about as wide as it is tall: a column of boxes reads worse the taller it gets,
  // and dividing one width between four repos is what made them slivers
  const FLOOR = grain === "module" ? 420 : 320
  const laneOf = (column: string) => {
    const ours = lanes > 1 ? units.filter((u) => repoOf(u.path) === column) : units
    const area = areaOf(ours)
    const want = lanes > 1 ? Math.sqrt(area * 1.3) : Math.sqrt(area * (width / tall))
    return { ours, wide: Math.max(FLOOR, Math.min(6000, want)) }
  }

  /** one repo laid out on its own, from its own corner */
  const laid = (lanes > 1 ? columns : [""]).map((column) => {
    const { ours, wide } = laneOf(column)
    const mine: Box[] = []
    const levels = [...new Set(ours.map((u) => u.level))].sort((a, b) => b - a)
    let y = 0
    for (const level of levels) {
      const band = `L${level}`
      const top = y
      const here = ours
        .filter((u) => u.level === level)
        // each language keeps its own side, and inside one the modules that answer
        // requests stand left of the modules that make them
        .sort(
          (a, b) =>
            (langAt.get(a.path) ?? "").localeCompare(langAt.get(b.path) ?? "") ||
            (facing.get(a.path) ?? 0) - (facing.get(b.path) ?? 0) ||
            a.path.localeCompare(b.path),
        )
      const room = wide - 2 * PAD
      // what each box wants: square pixels, laid square
      const want = (unit: (typeof here)[number]) =>
        Math.max(
          grain === "module" ? 184 : 120,
          Math.min(room, Math.sqrt(Math.max(1, load(unit.path)) * 1.35)),
        )
      // a shelf holds one language, and wraps when the next box would not fit
      const shelves: (typeof here)[] = []
      let held: typeof here = []
      let across = 0
      for (const unit of here) {
        const w = want(unit)
        const lang = langAt.get(unit.path) ?? ""
        const same = !held.length || (langAt.get(held[0].path) ?? "") === lang
        if (held.length && (!same || across + GAP + w > room)) {
          shelves.push(held)
          held = []
          across = 0
        }
        held.push(unit)
        across += (across ? GAP : 0) + w
      }
      if (held.length) shelves.push(held)

      for (const shelf of shelves) {
        const widths = shelf.map(want)
        // the floor can outgrow a narrow lane, so a shelf is scaled back to fit inside it
        const asked = widths.reduce((sum, one) => sum + one, 0) + GAP * (shelf.length - 1)
        if (asked > room)
          for (const i of widths.keys())
            widths[i] *= (room - GAP * (shelf.length - 1)) / (asked - GAP * (shelf.length - 1))
        const spare = Math.max(
          0,
          room - widths.reduce((sum, one) => sum + one, 0) - GAP * (shelf.length - 1),
        )
        const step = spare / (shelf.length + 1)
        let x = PAD + step
        let tall = 0
        shelf.forEach((unit, i) => {
          const w = widths[i]
          const inside = kids.get(unit.path) ?? []
          const h =
            grain === "function"
              ? pack(fitted(inside, w - 2 * PAD), w - 2 * PAD).h + 14
              : Math.max(
                  grain === "module" ? 88 : 80,
                  // never a sliver: past its own width a box is wider, not taller
                  Math.min(w * 1.7, load(unit.path) / w + 20),
                )
          mine.push({ id: unit.path, label: unit.path, parent: band, depth: 1, x, y, w, h })
          x += w + GAP + step
          tall = Math.max(tall, h)
        })
        y += tall + GAP
      }
      mine.push({
        id: lanes > 1 ? `${column}:${band}` : band,
        // the lane border carries the repo's name, so a band only ever says its level
        label: `level ${level}`,
        parent: "",
        depth: 0,
        x: PAD / 2,
        y: top,
        w: wide - PAD,
        h: Math.max(y - GAP - top, 40),
      })
    }
    for (const box of mine)
      if (box.depth === 1) box.parent = lanes > 1 ? `${column}:${box.parent}` : box.parent
    return { column, wide, deep: Math.max(y, 60), boxes: mine }
  })

  return laid
}

/** the lanes packed into rows and placed, so a folder of repos is not one long strip */
export function placing(laid: Lane[], lanes: number, width: number, tall: number) {
  const boxes: Box[] = []
  // and the lanes themselves packed into rows, so a folder of repos is not one long strip
  const room = Math.max(
    width,
    Math.sqrt(laid.reduce((sum, one) => sum + one.wide * one.deep, 0) * (width / tall)),
  )
  const total = laid.reduce((sum, one) => sum + one.wide + LANE, 0)
  const lines = Math.max(1, Math.ceil(total / room))
  // rows of about the same width rather than filled to the brim, or the last one holds a
  // single lane and whatever the order put last stops being on the right
  const across = total / lines
  const rows: (typeof laid)[] = []
  {
    let held: typeof laid = []
    let wide_ = 0
    let rest = laid.length
    let left_ = lines
    for (const one of laid) {
      if (held.length && (wide_ + one.wide > across || rest < left_) && left_ > 1) {
        rows.push(held)
        held = []
        wide_ = 0
        left_--
      }
      held.push(one)
      wide_ += one.wide + LANE
      rest--
    }
    if (held.length) rows.push(held)
  }

  let deepest = 0
  let widest = 0
  // the rows run bottom to top and every row left to right, both by which way a repo faces,
  // so nothing that calls out ever sits above or right of something that answers
  let top = lanes > 1 ? LANE : 0
  for (const held of [...rows].reverse()) {
    let left = 0
    for (const one of held) {
      for (const box of one.boxes) boxes.push({ ...box, x: box.x + left, y: box.y + top })
      // the lane itself, drawn as a border so two repos never read as one picture
      if (lanes > 1)
        boxes.push({
          id: `repo:${one.column}`,
          label: one.column,
          parent: "",
          depth: -1,
          x: left,
          y: top - LANE / 2,
          w: one.wide,
          h: one.deep + LANE / 2,
        })
      left += one.wide + LANE
      widest = Math.max(widest, left - LANE)
      deepest = Math.max(deepest, top + one.deep)
    }
    top += Math.max(...held.map((one) => one.deep)) + LANE * 2
  }

  return { boxes, widest, deepest }
}
