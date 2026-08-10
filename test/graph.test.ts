// owner: finn
// goal: an edge exists because it resolved, never because it was guessed

import assert from "node:assert/strict"
import { test } from "node:test"
import { build, jsonc, packageOf } from "../src/graph.ts"
import { specifiers, symbols } from "../src/specifiers.ts"
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

test("an inline type import is erased too, unless a value comes with it", () => {
  const found = specifiers(`
    import { type A } from "./a"
    import { type B, type C } from "./b"
    export { type D } from "./d"
    import { type E, value } from "./e"
    import Def, { type F } from "./f"
    import { typeOf } from "./g"
  `)
  const type = (text: string) => found.find((s) => s.text === text)?.type
  assert.equal(type("./a"), true)
  assert.equal(type("./b"), true)
  assert.equal(type("./d"), true)
  assert.equal(type("./e"), false, "a value comes with it, so the module is still loaded")
  assert.equal(type("./f"), false, "a default comes with it")
  assert.equal(type("./g"), false, "a name starting with type is not a type import")
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

test("a declaration counts whether it is exported on the spot or at the bottom", () => {
  assert.equal(symbols("export const A = 1\n").declares, 1)
  assert.equal(symbols("const A = [1, 2]\nexport { A }\n").declares, 1, "exported at the bottom")
  assert.equal(
    symbols('export type { A } from "./a"\n').declares,
    0,
    "a type re-export declares nothing",
  )
  assert.equal(symbols("export type A = string\n").declares, 1, "a type alias does")
  assert.equal(
    symbols("export function f() {\n  const inner = 1\n  return inner\n}\n").declares,
    1,
    "what is inside a body is not a declaration of the file",
  )
})

test("a door is a file that declares nothing and hands on what it imports", () => {
  const dir = repo({
    "star/index.ts": 'export * from "./a"\n',
    "star/a.ts": "export const a = 1\n",
    "named/index.ts": 'export { b } from "./b"\nexport type { T } from "./b"\n',
    "named/b.ts": "export const b = 1\nexport type T = number\n",
    "listed/index.ts": 'import { c } from "./c"\nimport { d } from "./d"\nexport { c, d }\n',
    "listed/c.ts": "export const c = 1\n",
    "listed/d.ts": "export const d = 1\n",
    "registry/index.ts": 'import { e } from "./e"\nconst ALL = [e]\nexport { ALL }\n',
    "registry/e.ts": "export const e = 1\n",
    "entry/main.ts": 'import "./side"\nimport { f } from "./f"\nconsole.log(f)\n',
    "entry/side.ts": "export const side = 1\n",
    "entry/f.ts": "export const f = 1\n",
    "wrapped/index.ts":
      'import { g } from "./g"\nexport namespace N {\n  export const held = g\n}\n',
    "wrapped/g.ts": "export const g = 1\n",
  })
  const g = build(dir)
  const door = (path: string) => g.modules[path].barrel
  assert.equal(door("star/index.ts"), true, "export * forwards")
  assert.equal(door("named/index.ts"), true, "so does a named re-export")
  assert.equal(door("listed/index.ts"), true, "and importing then exporting the same names")
  assert.equal(door("registry/index.ts"), false, "a registry declares the thing it builds")
  assert.equal(door("entry/main.ts"), false, "an entry imports but hands nothing on")
  assert.equal(door("star/a.ts"), false, "and a leaf is not a door")
})
