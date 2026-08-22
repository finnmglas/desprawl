// owner: finn
// goal: a level is earned by what a unit depends on, never by where it sits

import assert from "node:assert/strict"
import { test } from "node:test"
import { scc } from "../src/read/cycles.ts"
import { build } from "../src/read/graph.ts"
import { balanced, fold, roleOf, unitOf } from "../src/read/layers.ts"
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
  // one branch holds nearly everything, so auto has to go inside it
  for (let i = 0; i < 30; i++) files[`app/heavy/f${i}.ts`] = `export const f${i} = 1\n`
  for (let i = 0; i < 3; i++) files[`app/light/f${i}.ts`] = `export const f${i} = 1\n`
  const groups = new Set(Object.values(balanced(build(repo(files)))))
  assert.ok(groups.has("app/heavy"), "the weight decides, not the name")
  assert.ok(!groups.has("app"), "and its parent is no longer a group of its own")
})

test("a folder loop no file cycle spans is placement, not load order", () => {
  // four files, no path back to any of them: only the folding closes the loop
  const g = build(
    repo({
      "x/a.ts": 'import "../y/b"\n',
      "y/b.ts": "export const b = 1\n",
      "y/c.ts": 'import "../x/d"\n',
      "x/d.ts": "export const d = 1\n",
    }),
  )
  const loop = fold(g, 1).tangles[0]
  assert.equal(loop.units.join(), "x,y", "the folders do close a loop")
  assert.equal(loop.runtime, true, "and no type import is erasing it")
  assert.equal(loop.deep, false, "but nothing at file grain agrees")
})

test("a real file cycle is called out as one whatever grain it is folded at", () => {
  const g = build(
    repo({
      "x/a.ts": 'import "../y/b"\nexport const a = 1\n',
      "y/b.ts": 'import "../x/a"\nexport const b = 1\n',
    }),
  )
  assert.equal(fold(g, 1).tangles[0].deep, true)
})

test("an import through a barrel costs a path, not a refactor", () => {
  const g = build(
    repo({
      "x/a.ts": 'import "../y"\nexport const a = 1\n',
      "y/index.ts": 'export { b } from "./b"\n',
      "y/b.ts": 'import "../x/a"\nexport const b = 1\n',
    }),
  )
  assert.equal(g.modules["y/index.ts"].barrel, true, "it forwards and declares nothing")
  assert.equal(g.modules["y/b.ts"].barrel, false, "this one declares its own")
  const loop = fold(g, 1).tangles[0]
  const edge = loop.cut.find((c) => c.from === "x" && c.to === "y")!
  assert.equal(edge.glue, 1, "the import lands on the barrel, so naming the file removes it")
})

test("a group says whether one file is carrying its shape", () => {
  const files: Record<string, string> = {
    // everything outside imports one file here, the rest of the folder imports outward
    "hub/everyone.ts": "export const shared = 1\n",
    "lib/thing.ts": "export const thing = 1\n",
  }
  for (let i = 0; i < 6; i++) files[`hub/top${i}.ts`] = 'import "../lib/thing"\n'
  for (let i = 0; i < 12; i++) files[`user/u${i}.ts`] = 'import "../hub/everyone"\n'
  const layout = fold(build(repo(files)), 1)
  const hub = at(layout, "hub")
  assert.equal(hub.loudest, "hub/everyone.ts", "the file the most imports arrive at")
  assert.equal(hub.without.into, 0, "and without it nothing arrives at the group at all")
  assert.equal(hub.without.out, 6, "while the rest still reaches out")
})

test("a folder writes its suites with underscores, and none of them is source", () => {
  for (const path of [
    "e2e_tests/flow.py",
    "end_to_end_tests/flow.py",
    "manual_testing/poke.py",
    "load_testing/hit.py",
    "e2e-tests/flow.ts",
    "svc/test_helpers/one.py",
  ])
    assert.equal(roleOf(path), "test", path)
  for (const path of ["archive/old.py", "documentations/spec.md"])
    assert.equal(roleOf(path), "support", path)
  // and a word that merely ends in one of those is still somebody's code
  for (const path of ["src/latest/one.ts", "src/contest/two.ts", "scripts/paper-test/README.md"])
    assert.notEqual(roleOf(path), "test", path)
})

test("a leftover box bigger than the boxes beside it is opened, not shown as a module", () => {
  const files: Record<string, string> = { "package.json": "{}" }
  // one named child that clears the bar, and eight small ones that would sweep together
  for (let i = 0; i < 14; i++) files[`common/big/one${i}.ts`] = "export const a = 1\n".repeat(30)
  for (const name of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"])
    for (let i = 0; i < 3; i++)
      files[`common/${name}/one${i}.ts`] = "export const a = 1\n".repeat(20)
  files["app/main.ts"] = 'import "../common/big/one0"\n'.repeat(1)
  const graph = build(repo(files))
  const held = new Set(Object.values(balanced(graph)))
  assert.ok(held.has("common/alpha"), `alpha stands on its own, found ${[...held].join(", ")}`)
  const loose = Object.values(balanced(graph)).filter((one) => one === "common/*").length
  assert.ok(loose < 14, `what is left of common is a footnote, not ${loose} files`)
})
