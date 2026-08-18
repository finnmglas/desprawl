// owner: finn
// goal: an edge exists because a name resolved, not because it matched

import assert from "node:assert/strict"
import { test } from "node:test"
import { calls } from "../src/read/calls.ts"
import { repo } from "./repo.ts"

test("a call across files follows the import that brought the name in", () => {
  const dir = repo({
    "lib/math.ts": "export function add(a: number, b: number) {\n  return a + b\n}\n",
    "app/use.ts":
      'import { add } from "../lib/math.ts"\nexport function total() {\n  return add(1, 2)\n}\n',
  })
  const graph = calls(dir)
  assert.deepEqual(graph.symbols["app/use.ts#total"].calls, ["lib/math.ts#add"])
  assert.deepEqual(graph.symbols["lib/math.ts#add"].callers, ["app/use.ts#total"])
})

test("a name that is only spelled the same is not a call", () => {
  const dir = repo({
    "one/thing.ts": "export function run() {\n  return 1\n}\n",
    "two/other.ts": "function run() {\n  return 2\n}\nexport function go() {\n  return run()\n}\n",
  })
  const graph = calls(dir)
  assert.deepEqual(
    graph.symbols["two/other.ts#go"].calls,
    ["two/other.ts#run"],
    "its own, not the other file's",
  )
  assert.deepEqual(graph.symbols["one/thing.ts#run"].callers, [])
})

test("a size is the body, not the line the name sits on", () => {
  const dir = repo({
    "a.ts":
      "export function big() {\n  const x = 1\n  const y = 2\n  return x + y\n}\nexport const small = () => 1\n",
  })
  const graph = calls(dir)
  assert.equal(graph.symbols["a.ts#big"].lines, 5)
  assert.equal(graph.symbols["a.ts#small"].lines, 1)
})

test("a renamed re-export is walked through to what actually declares it", () => {
  const dir = repo({
    "lib/real.ts": "export function work() {\n  return 1\n}\n",
    "lib/index.ts": 'export { work } from "./real.ts"\n',
    "app/main.ts":
      'import { work } from "../lib/index.ts"\nexport function start() {\n  return work()\n}\n',
  })
  const graph = calls(dir)
  assert.deepEqual(graph.symbols["app/main.ts#start"].calls, ["lib/real.ts#work"])
})

test("a package call is counted apart, and a type is not a call at all", () => {
  const dir = repo({
    "a.ts":
      'import { render } from "react-dom"\nimport type { Thing } from "./thing.ts"\nexport function draw(t: Thing) {\n  return render(t)\n}\n',
    "thing.ts": "export type Thing = number\n",
  })
  const graph = calls(dir)
  const draw = graph.symbols["a.ts#draw"]
  assert.deepEqual(draw.packages, ["react-dom"])
  assert.deepEqual(draw.calls, [], "a type carries no call")
  assert.equal(graph.unresolved.length, 0)
})

test("a component used in markup is a call, since that is how one runs", () => {
  const dir = repo({
    "ui/button.tsx": "export function Button() {\n  return null\n}\n",
    "ui/page.tsx":
      'import { Button } from "./button.tsx"\nexport function Page() {\n  return <Button />\n}\n',
  })
  const graph = calls(dir)
  assert.deepEqual(graph.symbols["ui/page.tsx#Page"].calls, ["ui/button.tsx#Button"])
})

test("what nothing calls is counted, which is the point of the whole pass", () => {
  const dir = repo({
    "a.ts":
      "export function used() {\n  return 1\n}\nfunction alone() {\n  return 2\n}\nexport function go() {\n  return used()\n}\n",
  })
  const graph = calls(dir)
  assert.equal(graph.symbols["a.ts#alone"].callers.length, 0)
  assert.equal(graph.stats.uncalled, 2, "the lonely one, and the entry point nothing here calls")
})
