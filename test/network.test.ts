// owner: finn
// goal: a node stays in the box drawn around it

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/graph.ts"
import { calls } from "../src/calls.ts"
import { fold } from "../src/layers.ts"
import { net } from "../ui/lib/network.ts"
import { repo } from "./repo.ts"

const source = {
  "app/main.ts":
    "import { one } from '../lib/one.ts'\nexport function boot() { return one() }\nboot()\n",
  "app/page.ts": "import { two } from '../lib/two.ts'\nexport function page() { return two() }\n",
  "lib/one.ts": "export function one() { return 1 }\n",
  "lib/two.ts": "import { one } from './one.ts'\nexport function two() { return one() }\n",
}

const laid = (grain: "module" | "file" | "function") => {
  const dir = repo(source)
  const graph = build(dir)
  return net(fold(graph, 1), graph, calls(dir, graph), grain, 1, 900, 600)
}

test("every node sits inside the box drawn around it, whatever the grain", () => {
  for (const grain of ["module", "file", "function"] as const) {
    const drawn = laid(grain)
    const boxes = new Map(drawn.boxes.map((b) => [b.id, b]))
    assert.ok(drawn.spots.length > 0, `${grain} drew nothing`)
    for (const spot of drawn.spots) {
      const box = boxes.get(spot.box)
      assert.ok(box, `${grain}: ${spot.id} names a box that was never drawn`)
      assert.ok(
        spot.x >= box.x && spot.x <= box.x + box.w && spot.y >= box.y && spot.y <= box.y + box.h,
        `${grain}: ${spot.id} landed outside ${spot.box}`,
      )
    }
  }
})

test("a box is drawn once, since a second copy of one takes the nodes with it", () => {
  // two boxes of the same id read as one holding everything and one holding nothing, and a
  // map of them hides it: the second silently wins and the first is what gets drawn
  for (const grain of ["module", "file", "function"] as const) {
    const drawn = laid(grain)
    const seen = new Set<string>()
    for (const box of drawn.boxes) {
      assert.ok(!seen.has(box.id), `${grain}: ${box.id} was drawn twice`)
      seen.add(box.id)
    }
  }
})

test("a file box stays inside its module box, so the nesting is real and not drawn on", () => {
  const drawn = laid("function")
  const boxes = new Map(drawn.boxes.map((b) => [b.id, b]))
  const files = drawn.boxes.filter((b) => b.depth === 2)
  assert.ok(files.length > 1, "a repo of four files should draw more than one file box")
  for (const file of files) {
    const unit = boxes.get(file.parent)!
    assert.ok(file.x >= unit.x - 1 && file.x + file.w <= unit.x + unit.w + 1, `${file.id} too wide`)
    assert.ok(file.y >= unit.y - 1 && file.y + file.h <= unit.y + unit.h + 1, `${file.id} too tall`)
  }
})

test("one pair carries both kinds at once, which is why a wire holds two counts", () => {
  const drawn = laid("file")
  const wire = drawn.wires.find((w) => w.from === "lib/two.ts" && w.to === "lib/one.ts")
  assert.ok(wire, "two.ts imports and calls one.ts")
  assert.ok(wire.imports > 0, "the import is there")
  assert.ok(wire.calls > 0, "and the call is there too, on the same pair")
  assert.equal(wire.types, false, "neither of them is erased by the build")
})

test("a grain decides what a node is, and the module grain has no file in it", () => {
  assert.ok(
    laid("module").spots.every((s) => !s.id.endsWith(".ts")),
    "module grain draws folders",
  )
  assert.ok(
    laid("file").spots.every((s) => s.id.endsWith(".ts")),
    "file grain draws files",
  )
  assert.ok(
    laid("function").spots.every((s) => s.id.includes("#")),
    "function grain draws declarations",
  )
})
