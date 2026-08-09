// owner: finn
// goal: a level is earned by what a unit depends on, never by where it sits

import assert from "node:assert/strict"
import { test } from "node:test"
import { scc } from "../src/cycles.ts"
import { build } from "../src/graph.ts"
import { balanced, fold, roleOf, unitOf } from "../src/layers.ts"
import { repo } from "./repo.ts"

const at = (layout: ReturnType<typeof fold>, path: string) =>
  layout.units.find((u) => u.path === path)!

test("a unit is the folder at the asked depth, deeper or shallower", () => {
  assert.equal(unitOf("src/lib/deep/thing.ts", 1), "src")
  assert.equal(unitOf("src/lib/deep/thing.ts", 2), "src/lib")
  assert.equal(unitOf("cli.ts", 2), "cli.ts", "a file above the fold is its own unit")
  assert.equal(unitOf("src/lib/thing.ts", 99), "src/lib/thing.ts")
})

test("levels count how deep the dependencies go, not the folder nesting", () => {
  const g = build(
    repo({
      "app/page.ts": 'import "../feature/thing"\n',
      "feature/thing.ts": 'import "../lib/util"\n',
      "lib/util.ts": "export const util = 1\n",
    }),
  )
  const layout = fold(g, 1)
  assert.equal(at(layout, "lib").level, 0, "a leaf depends on nothing here")
  assert.equal(at(layout, "feature").level, 1)
  assert.equal(at(layout, "app").level, 2)
  assert.equal(layout.levels, 3)
  assert.equal(layout.feedback, 0, "a clean stack has nothing to explain away")
})

test("imports inside a unit are cohesion, not dependency", () => {
  const g = build(
    repo({
      "lib/a.ts": 'import "./b"\n',
      "lib/b.ts": "export const b = 1\n",
      "app/main.ts": 'import "../lib/a"\nimport "../lib/b"\n',
    }),
  )
  const layout = fold(g, 1)
  assert.equal(at(layout, "lib").internal, 1)
  assert.equal(at(layout, "lib").in.app, 2, "two file imports weigh the folder edge")
  assert.equal(layout.edges, 1, "and they are still one edge between units")
})

test("a tangle keeps its members on one level and is cut where it closes", () => {
  const g = build(
    repo({
      "a/one.ts": 'import "../b/two"\n',
      "b/two.ts": 'import "../c/three"\n',
      "c/three.ts": 'import "../a/one"\n',
      "top/main.ts": 'import "../a/one"\n',
    }),
  )
  const layout = fold(g, 1)
  const ring = ["a", "b", "c"]
  assert.equal(new Set(ring.map((u) => at(layout, u).level)).size, 1, "one level for the ring")
  assert.equal(layout.tangles.length, 1)
  assert.deepEqual(layout.tangles[0].units, ring)
  assert.equal(layout.feedback, 3, "every edge in the ring is unexplainable by levels")
  assert.equal(layout.tangles[0].cut.length, 1, "one edge opens a three unit ring")
  assert.equal(layout.tangles[0].runtime, true, "and it is there at runtime, not only in types")
  assert.ok(at(layout, "top").level > at(layout, "a").level, "what sits above a tangle is above it")
})

test("instability is what it leans on against what leans on it", () => {
  const g = build(
    repo({
      "lib/util.ts": "export const util = 1\n",
      "a/one.ts": 'import "../lib/util"\n',
      "b/two.ts": 'import "../lib/util"\n',
    }),
  )
  const layout = fold(g, 1)
  assert.equal(at(layout, "lib").instability, 0, "depended on, depends on nothing")
  assert.equal(at(layout, "a").instability, 1)
})

test("the cut it names really opens every loop", () => {
  // two rings sharing b, so cutting one edge cannot be enough
  const g = build(
    repo({
      "a/one.ts": 'import "../b/one"\n',
      "b/one.ts": 'import "../c/one"\nimport "../d/one"\n',
      "c/one.ts": 'import "../a/one"\n',
      "d/one.ts": 'import "../b/one"\n',
    }),
  )
  const layout = fold(g, 1)
  assert.equal(layout.tangles.length, 1, "one group holds both rings")

  const gone = new Set(layout.tangles.flatMap((t) => t.cut.map((c) => `${c.from} ${c.to}`)))
  assert.ok(gone.size >= 2, "two rings need two cuts")
  const left = scc(
    layout.units.map((u) => u.path),
    (path) => Object.keys(at(layout, path).out).filter((to) => !gone.has(`${path} ${to}`)),
  )
  assert.ok(
    left.every((group) => group.length === 1),
    "nothing is still tangled once the cut is applied",
  )
})

test("config, tests and scripts are not the architecture", () => {
  assert.equal(roleOf("src/lib/thing.ts"), "source")
  assert.equal(roleOf("next.config.mjs"), "support")
  assert.equal(roleOf("proxy.ts"), "support", "a file loose at the root is wiring")
  assert.equal(roleOf("scripts/build.ts"), "support")
  assert.equal(roleOf("public/vendor.js"), "support")
  assert.equal(roleOf("src/__mocks__/fs.ts"), "test")
  assert.equal(roleOf("src/lib/thing.test.ts"), "test")
})

test("a group carries what its files declare, and the packages they reach for", () => {
  const g = build(
    repo({
      "lib/one.ts": 'import "react"\nexport function one() {}\nexport const two = 1\n',
      "lib/two.ts": 'import "react"\nimport "lodash"\nexport class Thing {}\n',
    }),
  )
  const unit = fold(g, 1).units[0]
  assert.equal(unit.files, 2)
  assert.equal(unit.exports, 3, "two from one file, one from the other")
  assert.equal(unit.classes, 1)
  assert.equal(unit.packages, 2, "react counted once, not twice")
})

test("a loop made only of types is not a loop the build ever sees", () => {
  const g = build(
    repo({
      "a/one.ts": 'import type { Two } from "../b/two"\nexport const one = 1\n',
      "b/two.ts": 'import { one } from "../a/one"\nexport type Two = number\n',
    }),
  )
  const [loop] = fold(g, 1).tangles
  assert.equal(loop.units.length, 2, "the source really does point both ways")
  assert.equal(loop.runtime, false, "but only one direction survives the build")
  assert.equal(
    loop.cut[0].types,
    loop.cut[0].imports,
    "and the cut is a type import, so it is cheap",
  )
})

test("auto covers every file exactly once, and never makes a group of one file", () => {
  const g = build(
    repo({
      "app/page.ts": 'import "../lib/util"\n',
      "app/deep/one.ts": "export const one = 1\n",
      "app/deep/two.ts": "export const two = 2\n",
      "lib/util.ts": "export const util = 1\n",
      "loose.ts": "export const loose = 1\n",
    }),
  )
  const assign = balanced(g)
  assert.deepEqual(
    Object.keys(assign).sort(),
    Object.keys(g.modules).sort(),
    "every module is placed",
  )
  for (const [file, group] of Object.entries(assign))
    assert.notEqual(group, file, `${group} is a file pretending to be a group`)
  assert.equal(
    fold(g, assign).units.reduce((sum, u) => sum + u.files, 0),
    5,
  )
})

test("a top folder is a group however small, since it is what the repo is made of", () => {
  const files: Record<string, string> = { "tiny/one.ts": "export const one = 1\n" }
  for (let i = 0; i < 40; i++)
    files[`big/f${i}.ts`] = `export const f${i} = ${"1 + ".repeat(50)}1\n`
  const groups = new Set(Object.values(balanced(build(repo(files)))))
  assert.ok(groups.has("tiny"), "the small one is still named")
  assert.ok(
    [...groups].some((g) => g.startsWith("big")),
    "and the big one is there too",
  )
})

test("the heaviest folder is the one that gets opened", () => {
  const files: Record<string, string> = { "small/one.ts": "export const one = 1\n" }
  // one branch holds nearly everything, so auto has to go inside it rather than name it once
  for (let i = 0; i < 30; i++) files[`app/heavy/f${i}.ts`] = `export const f${i} = 1\n`
  for (let i = 0; i < 3; i++) files[`app/light/f${i}.ts`] = `export const f${i} = 1\n`
  const groups = new Set(Object.values(balanced(build(repo(files)))))
  assert.ok(groups.has("app/heavy"), "the weight decides, not the name")
  assert.ok(!groups.has("app"), "and its parent is no longer a group of its own")
})
