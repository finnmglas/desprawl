// owner: finn
// goal: an edge exists because it resolved, never because it was guessed

import assert from "node:assert/strict"
import { test } from "node:test"
import { build, jsonc, packageOf } from "../src/graph.ts"
import { specifiers } from "../src/specifiers.ts"
import { repo } from "./repo.ts"

const to = (graph: ReturnType<typeof build>, from: string) =>
  graph.modules[from].out.map((e) => e.to).sort()

test("a comment, a string or a regex cannot invent an import", () => {
  const found = specifiers(`
    import real from "./real.ts"
    // import commented from "./no"
    /* import blocked from "./no" */
    const text = "import fake from './no'"
    const re = /import x from ".\\/no"/
  `)
  assert.deepEqual(
    found.map((s) => s.text),
    ["./real.ts"],
  )
})

test("every form of import is found, and told apart", () => {
  const found = specifiers(`
    import a from "./a"
    import type { B } from "./b"
    export { c } from "./c"
    export * from "./d"
    import "./side"
    const e = await import("./e")
    const f = require("./f")
    import g = require("./g")
  `)
  assert.deepEqual(
    found.map((s) => s.text),
    ["./a", "./b", "./c", "./d", "./side", "./e", "./f", "./g"],
  )
  assert.equal(found.find((s) => s.text === "./b")?.type, true, "type only is marked")
  assert.equal(found.find((s) => s.text === "./e")?.lazy, true, "dynamic is marked")
})

test("relative imports resolve through extensions and index files", () => {
  const dir = repo({
    "a.ts": 'import "./b"\nimport "./c/index.ts"\nimport "./d/"\n',
    "b.tsx": "export const b = 1\n",
    "c/index.ts": "export const c = 1\n",
    "d/index.tsx": "export const d = 1\n",
  })
  const g = build(dir)
  assert.deepEqual(to(g, "a.ts"), ["b.tsx", "c/index.ts", "d/index.tsx"])
  assert.equal(g.stats.coverage, 1)
})

test("a .js specifier finds the typescript that will produce it", () => {
  const dir = repo({
    "a.ts": 'import "./b.js"\nimport "./c.js"\n',
    "b.ts": "export const b = 1\n",
    "c.d.ts": "export declare const c: number\n",
  })
  const g = build(dir)
  assert.deepEqual(to(g, "a.ts"), ["b.ts"])
  assert.equal(g.missing.length, 0)
  assert.equal(g.stats.assets, 1)
})

test("a path alias resolves, even when the pattern looks like a comment", () => {
  // the slash star in "@/*" is what broke the first parser
  const dir = repo({
    "tsconfig.json":
      '{\n  // an alias\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } },\n  "include": ["**/*"],\n}',
    "src/app.ts": 'import "@/lib/thing"\n',
    "src/lib/thing.ts": "export const thing = 1\n",
  })
  const g = build(dir)
  assert.deepEqual(to(g, "src/app.ts"), ["src/lib/thing.ts"])
  assert.deepEqual(Object.keys(g.packages), [], "an alias is not a package")
})

test("an alias that resolves to nothing is a miss, never a package", () => {
  const dir = repo({
    "tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    "src/app.ts": 'import "@/lib/gone"\n',
  })
  const g = build(dir)
  assert.deepEqual(Object.keys(g.packages), [], "a broken alias must not become a package")
  assert.equal(g.missing.length, 1)
  assert.ok(g.stats.coverage < 1, "coverage has to fall when something is unresolved")
})

test("extends is followed to the config that holds the paths", () => {
  const dir = repo({
    "tsconfig.json": '{"extends":"./tsconfig.base.json"}',
    "tsconfig.base.json": '{"compilerOptions":{"paths":{"~/*":["./app/*"]}}}',
    "app/one.ts": 'import "~/two"\n',
    "app/two.ts": "export const two = 1\n",
  })
  assert.deepEqual(to(build(dir), "app/one.ts"), ["app/two.ts"])
})

test("a workspace package is source here, not an install", () => {
  const dir = repo({
    "package.json": '{"name":"root","workspaces":["packages/*"]}',
    "packages/ui/package.json": '{"name":"@acme/ui","main":"index.ts"}',
    "packages/ui/index.ts": "export const button = 1\n",
    "apps/web/page.ts": 'import "@acme/ui"\nimport "react"\n',
  })
  const g = build(dir)
  assert.deepEqual(to(g, "apps/web/page.ts"), ["packages/ui/index.ts"])
  assert.deepEqual(Object.keys(g.packages), ["react"], "only the real install is a package")
})

test("a bundle's internal requires are not filesystem paths", () => {
  const dir = repo({
    "vendor.js": 'parcelRequire = (function (modules) {})\nrequire("./chunk-1")\n',
    "app.ts": 'import "./real"\n',
    "real.ts": "export const real = 1\n",
  })
  const g = build(dir)
  assert.equal(g.missing.length, 0, "a bundle must not report broken imports")
  assert.equal(g.modules["vendor.js"], undefined, "and it is not a module of its own")
})

test("fan in is the mirror of fan out", () => {
  const dir = repo({
    "a.ts": 'import "./c"\n',
    "b.ts": 'import "./c"\n',
    "c.ts": "export const c = 1\n",
  })
  const g = build(dir)
  assert.deepEqual(g.modules["c.ts"].in.sort(), ["a.ts", "b.ts"])
  assert.equal(g.modules["c.ts"].out.length, 0)
})

test("json with comments survives a glob that looks like one", () => {
  const parsed = jsonc('{ /* note */ "paths": { "@/*": ["./*"] }, "include": ["**/*"], }') as {
    paths: Record<string, string[]>
    include: string[]
  }
  assert.deepEqual(parsed.paths, { "@/*": ["./*"] })
  assert.deepEqual(parsed.include, ["**/*"])
})

test("a package name is the thing that installs, not the file inside it", () => {
  assert.equal(packageOf("react"), "react")
  assert.equal(packageOf("react-dom/client"), "react-dom")
  assert.equal(packageOf("@scope/pkg/deep/path"), "@scope/pkg")
  assert.equal(packageOf("node:fs"), "node:fs")
})
