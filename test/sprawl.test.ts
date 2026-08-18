// owner: finn
// goal: textual sprawl, found without a graph

import assert from "node:assert/strict"
import { test } from "node:test"
import { copied, repeated, talky } from "../src/facts/sprawl.ts"
import { isEntry, isTest } from "../src/facts/work.ts"
import { repo } from "./repo.ts"

test("a literal typed in three files is one name waiting to be made", () => {
  const dir = repo({
    "a.ts": 'export const a = "no such commit in this repository"\n',
    "b.ts": 'export const b = "no such commit in this repository"\n',
    "c.ts": 'export const c = "no such commit in this repository"\n',
    "d.ts": 'export const d = "short"\nexport const e = "./a/relative/path/that/is/long"\n',
  })
  const found = repeated(dir, ["a.ts", "b.ts", "c.ts", "d.ts"])
  assert.equal(found.length, 1, "a path is already a name, a short string is not worth one")
  assert.equal(found[0].times, 3)
})

test("a class list is judged as a component, not as a name", () => {
  const dir = repo({
    "a.tsx": 'export const a = "flex items-center gap-2"\n',
    "b.tsx": 'export const b = "flex items-center gap-2"\n',
    "c.tsx":
      'import { cn } from "class-variance-authority-x"\nexport const c = cn("flex items-center gap-2")\n',
  })
  const few = repeated(dir, ["a.tsx", "b.tsx", "c.tsx"])
  assert.deepEqual(few, [], "three files of two classes is how tailwind is written")

  const wide = repo(
    Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [
        `p${i}.tsx`,
        `export const p${i} = "rounded-lg border border-border bg-card px-4 py-3 shadow-sm"\n`,
      ]),
    ),
  )
  const found = repeated(
    wide,
    Array.from({ length: 5 }, (_, i) => `p${i}.tsx`),
  )
  assert.equal(found.length, 1, "six classes across five files is a component nobody made")
  assert.equal(found[0].styled, true, "and it is marked as styling, since the cure differs")
})

test("two files, one literal, is not yet worth a name", () => {
  const dir = repo({
    "a.ts": 'export const a = "no such commit in this repository"\n',
    "b.ts": 'export const b = "no such commit in this repository"\n',
  })
  assert.deepEqual(repeated(dir, ["a.ts", "b.ts"]), [])
})

test("a copied run is reported whole, once, however long it is", () => {
  const body = [
    "const total = rows.reduce((sum, row) => sum + row.value, 0)",
    "const mean = total / Math.max(1, rows.length)",
    "const spread = rows.map((row) => Math.abs(row.value - mean))",
    "const worst = Math.max(...spread, 0)",
    "const share = worst / Math.max(1, mean)",
    "const band = share > 2 ? 'wide' : share > 1 ? 'some' : 'tight'",
  ]
  const dir = repo({
    "a.ts": `function one(rows) {\n${body.join("\n")}\n  return band\n}\n`,
    "b.ts": `function two(rows) {\n${body.join("\n")}\n  return share\n}\n`,
  })
  const found = copied(dir, ["a.ts", "b.ts"])
  assert.equal(found.length, 1, "one copy is one finding, not one per window")
  assert.equal(found[0].lines.length, body.length, "grown as far as the lines match")
  assert.deepEqual(found[0].at, ["a.ts:2", "b.ts:2"])
})

test("a run of imports or closing brackets is not a copy anybody can fix", () => {
  const dull = ["}", "})", "],", ";", ")"]
  const dir = repo({
    "a.ts": `${dull.join("\n")}\n`,
    "b.ts": `${dull.join("\n")}\n`,
  })
  assert.deepEqual(copied(dir, ["a.ts", "b.ts"]), [])
})

test("what a framework loads by name is not code nobody calls", () => {
  for (const one of ["src/app/page.tsx", "app/api/x/route.ts", "convex/queries.ts", "src/index.ts"])
    assert.ok(isEntry(one), one)
  assert.ok(!isEntry("ui/lib/format.ts"))
  for (const one of ["test/graph.test.ts", "src/__tests__/one.ts", "e2e/flow.spec.ts"])
    assert.ok(isTest(one), one)
  assert.ok(!isTest("src/tested.ts"))
})

test("a file that is mostly prose is one to read, a commented one is not", () => {
  const prose = `// ${"a design nobody could hold in their head ".repeat(260)}\n`
  const dir = repo({
    "heavy.ts": `${prose}export const a = 1\n`,
    "normal.ts": `// one line about it\n${"export const b = 1\n".repeat(400)}`,
    "small.ts": "// short\nexport const c = 1\n",
  })
  const found = talky(dir, ["heavy.ts", "normal.ts", "small.ts"])
  assert.deepEqual(
    found.map((one) => one.path),
    ["heavy.ts"],
    "a share only means something once there is enough prose to weigh",
  )
  assert.ok(found[0].share > 0.9)
})
