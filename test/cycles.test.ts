// owner: finn
// goal: a tangle is reported because it exists, with its real shape

import assert from "node:assert/strict"
import { test } from "node:test"
import { cycles } from "../src/read/cycles.ts"
import { build } from "../src/read/graph.ts"
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
