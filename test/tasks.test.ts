// owner: finn
// goal: a task is a thing that was found, never a thing that was rated

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/read/graph.ts"
import { calls } from "../src/read/calls.ts"
import { balanced, fold } from "../src/read/layers.ts"
import { IMPACTS, tasks, weigh } from "../src/facts/work.ts"
import type { Deps } from "../src/facts/deps.ts"
import { repo } from "./repo.ts"

const found = (files: Record<string, string>) => {
  const dir = repo(files)
  const graph = build(dir)
  const lines = new Map(Object.values(graph.modules).map((one) => [one.path, one.lines]))
  return tasks(fold(graph, balanced(graph)), calls(dir, graph), null, lines, graph)
}

test("a ring of imports is one task, named after the folder holding it", () => {
  const list = found({
    "app/a.ts": "import { b } from './b.ts'\nexport const a = () => b()\n",
    "app/b.ts": "import { a } from './a.ts'\nexport const b = () => a()\n",
  })
  const ring = list.find((one) => one.kind === "cycle")
  assert.ok(ring, "two files importing each other is a cycle to break")
  assert.equal(ring.where, "app")
  assert.ok(ring.lines > 0, "and it carries the lines it would touch")
})

test("an unreachable declaration is work with its own size on it", () => {
  const list = found({
    "main.ts": "export function used() { return 1 }\nused()\n",
    "lib.ts": "function orphan() {\n  return 2\n}\n",
  })
  const dead = list.find((one) => one.kind === "dead")
  assert.ok(dead, "nothing reaches orphan")
  assert.match(dead.title, /orphan/)
  assert.equal(dead.mechanical, true, "deleting it is a known change")
})

test("nothing is invented for a repo with nothing wrong with it", () => {
  const list = found({ "main.ts": "export function one() { return 1 }\none()\n" })
  assert.deepEqual(list, [], "an empty list is an answer, and a made up task is not")
})

test("the order is clears against minutes, so a big cheap one leads", () => {
  const cheap = { reach: 10, minutes: 5 } as Parameters<typeof weigh>[0]
  const dear = { reach: 10, minutes: 50 } as Parameters<typeof weigh>[0]
  assert.ok(weigh(cheap) > weigh(dear), "same clearing, less time, read first")
})

test("an import of something that is not there is the one finding with nothing to weigh up", () => {
  const list = found({
    "main.ts": "import { gone } from './gone.ts'\nexport const one = () => gone()\none()\n",
  })
  const broken = list.find((task) => task.kind === "broken")
  assert.ok(broken, "an import naming a file that does not exist is a task")
  assert.match(broken.title, /gone\.ts/)
  assert.equal(broken.mechanical, true)
})

/** one package with one advisory against it, which is the smallest thing that makes a task */
const kit = (dev: boolean): Deps => ({
  offline: false,
  missed: 0,
  checked: "2026-08-13T00:00:00.000Z",
  list: [
    {
      name: "axios",
      range: "^1.0.0",
      version: "1.0.0",
      license: "MIT",
      dev,
      direct: true,
      released: "",
      used: "",
      latest: "",
      bytes: 0,
      advisories: [
        { id: "CVE-1", summary: "something", severity: "HIGH", url: "https://osv.dev/x" },
      ],
    },
  ],
})

test("every task says who feels it, and a dev only advisory is not a runtime one", () => {
  const shipped = tasks(null, null, kit(false), new Map())
  const local = tasks(null, null, kit(true), new Map())
  assert.equal(shipped[0].hits, "runtime", "a package that ships reaches whoever runs it")
  assert.equal(local[0].hits, "local dev", "one that never ships cannot")
  for (const task of [...shipped, ...local]) assert.ok(IMPACTS.includes(task.hits), task.title)
})
