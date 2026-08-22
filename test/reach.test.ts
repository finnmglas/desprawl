// owner: finn
// goal: what the call graph is allowed to call dead

import assert from "node:assert/strict"
import { test } from "node:test"
import { calls, TOP } from "../src/read/calls.ts"
import { build } from "../src/read/graph.ts"
import { REACHES, reachOf, reached, rings, twins } from "../src/read/reach.ts"
import { repo } from "./repo.ts"

const graph = (files: Record<string, string>) => calls(repo(files))

test("dead means nothing running arrives at it, not that nobody calls it", () => {
  const found = graph({
    "main.ts": "import { used } from './lib.ts'\nused()\n",
    "lib.ts":
      "export function used() { return helper() }\n" +
      "function helper() { return 1 }\n" +
      "function orphan() { return alone() }\n" +
      "function alone() { return 2 }\n",
  })
  const live = reached(found, true)
  const at = (name: string) => reachOf(found.symbols[`lib.ts#${name}`], live)
  assert.equal(at("used"), "called", "main calls it")
  assert.equal(at("helper"), "called", "reached through the one that is")
  assert.equal(at("orphan"), "dead", "declared, exported by nothing, called by nothing")
  assert.equal(at("alone"), "dead", "only a dead one calls it, which is not a caller at all")
})

test("an export is a root or it is not, and that is the reader's call", () => {
  const found = graph({ "lib.ts": "export function api() { return 1 }\n" })
  const id = "lib.ts#api"
  assert.equal(reachOf(found.symbols[id], reached(found, true)), "open", "kept for the outside")
  assert.equal(reachOf(found.symbols[id], reached(found, false)), "dead", "nothing here runs it")
})

test("the top level of a file always runs, since importing it is running it", () => {
  const found = graph({ "main.ts": "console.log(1)\n" })
  const top = found.symbols[`main.ts#${TOP}`]
  assert.ok(top, "a file with statements outside every declaration has a top level")
  assert.equal(reachOf(top, reached(found, false)), "runs")
  assert.equal(REACHES.runs.label, "runs")
})

test("a name in two files is repeated, the same name twice in one file is not", () => {
  const found = graph({
    "a.ts": "export function format() { return 1 }\nfunction only() { return 2 }\n",
    "b.ts": "export function format() { return 3 }\n",
    "c.ts": "export function format() { return 4 }\n",
  })
  const [first, ...rest] = twins(found)
  assert.equal(first.name, "format")
  assert.deepEqual(first.files, ["a.ts", "b.ts", "c.ts"])
  assert.equal(rest.length, 0, "a name only one file declares is not repeated")
})

test("a ring needs two, since a call to itself is never recorded", () => {
  const found = graph({
    "a.ts":
      "export function ping() { return pong() }\n" +
      "export function pong() { return ping() }\n" +
      "export function loops() { return loops() }\n",
  })
  const found2 = rings(found)
  assert.equal(found2.length, 1, "recursing on itself is not a ring anything can see here")
  assert.deepEqual(found2[0].map((id) => id.split("#")[1]).sort(), ["ping", "pong"])
})

test("a value declared inline runs where it sits, and is never a delete task", () => {
  const dir = repo({
    "src/setup.ts": [
      "import { stub } from './stub'",
      "",
      "stub('ResizeObserver', class ResizeObserver {",
      "  observe() {}",
      "})",
      "",
      "export function make() {",
      "  return function isPersistableKey(key: string) {",
      "    return key.length > 0",
      "  }",
      "}",
      "",
      "function reallyDead() {",
      "  return 1",
      "}",
      "",
    ].join("\n"),
    "src/stub.ts":
      "export function stub(name: string, made: unknown) {\n  return [name, made]\n}\n",
  })
  const found = calls(dir, build(dir))
  const live = reached(found, true)
  const of = (name: string) => reachOf(found.symbols[`src/setup.ts#${name}`], live)
  assert.equal(of("ResizeObserver"), "runs", "a class passed as an argument is constructed")
  assert.equal(of("isPersistableKey"), "runs", "a factory hands its return value on")
  assert.equal(of("reallyDead"), "dead", "and a statement nothing reaches still is")
})

test("a caller through a star barrel is still a caller", () => {
  const dir = repo({
    "utils/datetime.ts": "export function formatAsUTCDate(at: string) {\n  return at\n}\n",
    "utils/index.ts": "export * from './datetime'\n",
    "app/page.ts": [
      "import { formatAsUTCDate } from '../utils'",
      "",
      "export function show(at: string) {",
      "  return formatAsUTCDate(at)",
      "}",
      "",
    ].join("\n"),
  })
  const found = calls(dir, build(dir))
  assert.deepEqual(found.symbols["utils/datetime.ts#formatAsUTCDate"].callers, ["app/page.ts#show"])
})
