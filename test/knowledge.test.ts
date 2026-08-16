// owner: finn
// goal: an exported graph that something else can read without guessing

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/graph.ts"
import { calls } from "../src/calls.ts"
import { balanced, fold } from "../src/layers.ts"
import { asRows, knowledge } from "../src/knowledge.ts"
import { repo } from "./repo.ts"

const source = {
  "app/main.ts":
    "import { one } from '../lib/one.ts'\nexport function boot() { return one() }\nboot()\n",
  "lib/one.ts": "import 'react'\nexport function one() { return 1 }\n",
  "package.json": '{"name":"kg","dependencies":{"react":"19.0.0"}}',
}

const built = (grain: "module" | "file" | "function") => {
  const dir = repo(source)
  const graph = build(dir)
  const split = balanced(graph)
  return knowledge(dir, {
    graph,
    calls: calls(dir, graph),
    layout: fold(graph, split),
    grain,
    split,
  })
}

test("every link joins two things that are listed, at every grain", () => {
  for (const grain of ["module", "file", "function"] as const) {
    const found = built(grain)
    const ids = new Set(found.things.map((one) => one.id))
    for (const link of found.links) {
      assert.ok(ids.has(link.from), `${grain}: ${link.from} is linked but never listed`)
      assert.ok(ids.has(link.to), `${grain}: ${link.to} is linked but never listed`)
    }
  }
})

test("what holds what is a tree, and the imports and calls are drawn over it", () => {
  const found = built("function")
  const inside = new Map(found.things.map((one) => [one.id, one.inside]))
  const declared = found.things.filter((one) => one.sort === "declaration")
  assert.ok(declared.length > 0)
  for (const one of declared)
    assert.equal(inside.get(one.id)?.endsWith(".ts"), true, "a declaration sits in a file")
  assert.ok(
    found.links.some((one) => one.sort === "contains"),
    "and the holding is a relation of its own",
  )
})

test("an install is a thing the graph reaches, not a file it holds", () => {
  const found = built("file")
  const react = found.things.find((one) => one.id === "npm:react")
  assert.ok(react, "a package it installs is part of what it knows")
  assert.equal(react.sort, "package")
  assert.ok(found.links.some((one) => one.sort === "installs" && one.to === "npm:react"))
})

test("the rows carry both, since a table is what most things open", () => {
  const rows = asRows(built("file"))
  assert.deepEqual(rows[0][0], "kind")
  assert.ok(rows.length > 3, "a header, the things, then the links")
})
