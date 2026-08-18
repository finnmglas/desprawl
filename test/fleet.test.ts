// owner: finn
// goal: a folder of repos reads as one, and never as whichever repo came first

import assert from "node:assert/strict"
import { test } from "node:test"
import { join } from "node:path"
import { everyCall, graphs, many } from "../src/facts/many.ts"
import { callsIn, graphIn } from "../src/facts/within.ts"
import { holds } from "../src/serve/holds.ts"
import { folder, repo } from "./repo.ts"

const two = () =>
  folder({
    one: [
      {
        files: {
          "a.ts": "export const a = 1\n",
          "package.json": '{"name":"one","dependencies":{}}',
        },
        author: "Ann <ann@a.io>",
      },
      { files: { "a.ts": "export const a = 2\n" }, author: "Ann <ann@a.io>" },
    ],
    two: [
      { files: { "b.ts": "export const b = 1\n" }, author: "Bo <bo@b.io>" },
      { files: { "b.ts": "export const b = 2\n" }, author: "Bo <bo@b.io>" },
      { files: { "b.ts": "export const b = 3\n" }, author: "Cy <cy@c.io>" },
    ],
  })

test("the numbers a folder answers with are every repo's, not the first one's", () => {
  const dir = two()
  const kept = holds(dir)
  assert.equal(kept.fleet.length, 2, "both repos are read")
  assert.equal(kept.commits(), 5, "five commits between them, not one repo's two")

  const line = kept.timeline()
  assert.equal(line.total, 5)
  assert.equal(
    new Set(line.samples.map((one) => one.repo)).size,
    2,
    "and every sample says which repo it came from",
  )

  // asked about one of them, it answers for that one alone
  assert.equal(kept.commits("one"), 2)
  assert.equal(kept.commits("two"), 3)
})

test("a folder has no stack of its own, and its people are counted once", () => {
  const { all } = many(two())
  assert.equal(all.commits, 5)
  assert.equal(all.stack.name, undefined, "no manifest speaks for a folder")
  assert.equal(all.contributors.length, 3, "Ann, Bo and Cy")
  assert.equal(all.identities.length, 3, "one row per address, not a copy of the folded list")
  assert.ok(
    all.identities.every((one) => one.email),
    "and each identity is an address",
  )
})

test("some of a folder reads out of what was read for all of it", () => {
  const dir = two()
  const all = graphs(dir)
  const mine = graphIn(all, ["two"])
  const held = graphs(dir, [join(dir, "two")])

  assert.deepEqual(
    Object.keys(mine.modules).sort(),
    Object.keys(held.modules).sort(),
    "the same modules as reading that repo alone",
  )
  assert.deepEqual(mine.stats, held.stats, "and the same numbers, summed rather than guessed")
  assert.deepEqual(mine.repos, ["two"])

  const rang = callsIn(everyCall(dir), ["two"])
  assert.deepEqual(
    Object.keys(rang.symbols).sort(),
    Object.keys(everyCall(dir, [join(dir, "two")]).symbols).sort(),
    "and the declarations in it",
  )
})

test("one repo on its own is read as itself, never as a folder holding it", () => {
  const dir = repo({ "a.ts": "export const a = 1\n", "b.ts": "import './a.ts'\n" })
  const kept = holds(dir)
  assert.deepEqual(kept.fleet, [], "nothing about it is a fleet")
  assert.ok(Object.keys(kept.graph(null).modules).length > 0, "and its graph holds its files")
  assert.ok(
    Object.keys(kept.calls(null).symbols).length > 0,
    "and its call graph, what it declares",
  )
})
