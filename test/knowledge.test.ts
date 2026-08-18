// owner: finn
// goal: an exported graph that something else can read without guessing

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/read/graph.ts"
import { calls } from "../src/read/calls.ts"
import { balanced, fold } from "../src/read/layers.ts"
import { asRows, knowledge } from "../src/facts/knowledge.ts"
import { repo } from "./repo.ts"

const source = {
  "app/main.ts":
    "import { one } from '../lib/one.ts'\nexport function boot() { return one() }\nboot()\n",
  "lib/one.ts": "import 'react'\nexport function one() { return 1 }\n",
  "package.json": '{"name":"kg","dependencies":{"react":"19.0.0"}}',
}

const built = (grain: "module" | "file" | "declaration") => {
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
  for (const grain of ["module", "file", "declaration"] as const) {
    const found = built(grain)
    const ids = new Set(found.things.map((one) => one.id))
    for (const link of found.links) {
      assert.ok(ids.has(link.from), `${grain}: ${link.from} is linked but never listed`)
      assert.ok(ids.has(link.to), `${grain}: ${link.to} is linked but never listed`)
    }
  }
})

test("what holds what is said once, as the tree, and never again as a link", () => {
  const found = built("declaration")
  const inside = new Map(found.things.map((one) => [one.id, one.inside]))
  const declared = found.things.filter((one) => one.kind === "declaration")
  assert.ok(declared.length > 0)
  for (const one of declared)
    assert.equal(inside.get(one.id)?.endsWith(".ts"), true, "a declaration sits in a file")
  assert.deepEqual(
    [...new Set(found.links.map((one) => one.kind))].sort(),
    ["calls", "imports", "installs"],
    "a link is what a thing does to another, never what holds it",
  )
})

test("a thing says what it was read as, so a polyglot graph comes apart again", () => {
  const found = built("declaration")
  for (const one of found.things.filter((held) => held.kind !== "package"))
    assert.equal(one.lang, "ts", "every module, file and declaration here is typescript")
})

test("an install is a thing the graph reaches, not a file it holds", () => {
  const found = built("file")
  const react = found.things.find((one) => one.id === "npm:react")
  assert.ok(react, "a package it installs is part of what it knows, named for its registry")
  assert.equal(react.kind, "package")
  assert.ok(found.links.some((one) => one.kind === "installs" && one.to === "npm:react"))
})

test("the rows carry both, since a table is what most things open", () => {
  const rows = asRows(built("file"))
  assert.deepEqual(rows[0][0], "kind")
  assert.ok(rows.length > 3, "a header, the things, then the links")
})
