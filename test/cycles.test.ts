// owner: finn
// goal: a tangle is reported because it exists, with its real shape

import assert from "node:assert/strict"
import { test } from "node:test"
import { cycles, hotspots } from "../src/cycles.ts"
import { build } from "../src/graph.ts"
import { repo } from "./repo.ts"

test("a ring is one group, a chain is none", () => {
  const ring = build(
    repo({
      "a.ts": 'import "./b"\n',
      "b.ts": 'import "./c"\n',
      "c.ts": 'import "./a"\n',
      "leaf.ts": 'import "./a"\n',
    }),
  )
  const found = cycles(ring)
  assert.equal(found.length, 1)
  assert.deepEqual(found[0].sort(), ["a.ts", "b.ts", "c.ts"], "the leaf points in, it is not part")

  const chain = build(repo({ "a.ts": 'import "./b"\n', "b.ts": "export const b = 1\n" }))
  assert.deepEqual(cycles(chain), [])
})

test("a cycle made only of types is one the build never sees", () => {
  const dir = repo({
    "a.ts": 'import type { B } from "./b"\nexport const a = 1\n',
    "b.ts": 'import type { A } from "./a"\nexport const b = 1\n',
  })
  const g = build(dir)
  assert.equal(cycles(g).length, 1, "it is a cycle in the source")
  assert.deepEqual(cycles(g, { types: false }), [], "and not one at runtime")
})

test("fan in ranks by who is actually imported", () => {
  const g = build(
    repo({
      "hub.ts": "export const hub = 1\n",
      "a.ts": 'import "./hub"\n',
      "b.ts": 'import "./hub"\n',
      "c.ts": 'import "./hub"\nimport "./a"\n',
    }),
  )
  const hot = hotspots(g, 2)
  assert.deepEqual(hot.depended[0], { path: "hub.ts", count: 3 })
  assert.deepEqual(hot.depending[0], { path: "c.ts", count: 2 })
  assert.deepEqual(hot.unreached.sort(), ["b.ts", "c.ts"], "nothing imports these two")
})
