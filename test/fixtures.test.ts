// owner: finn
// goal: one small repo per language, with the edges it must find

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/graph.ts"
import { calls } from "../src/calls.ts"
import { LANGUAGES, dialectOf } from "../src/dialects.ts"
import { foreign } from "../src/specifiers.ts"
import { repo } from "./repo.ts"

interface Fixture {
  lang: string
  files: Record<string, string>
  /** the import edges it must find, as from -> to */
  edges: [string, string][]
  /** every declaration it must name */
  declares: string[]
  /** calls that must land, as caller -> callee */
  reaches?: [string, string][]
}

const FIXTURES: Fixture[] = [
  {
    lang: "rust",
    files: {
      "Cargo.toml": '[package]\nname = "fix"\n\n[dependencies]\nserde = "1.0"\n',
      "src/main.rs":
        "mod helper;\nmod deep;\nuse crate::deep::inner::deeply;\n\nfn main() {\n  helper::go();\n  deeply();\n}\n",
      "src/helper.rs": "pub fn go() -> u8 { 1 }\npub struct Held;\n",
      "src/deep/mod.rs": "pub mod inner;\n",
      "src/deep/inner.rs": "pub fn deeply() -> u8 { 2 }\n",
    },
    edges: [
      ["src/main.rs", "src/helper.rs"],
      ["src/main.rs", "src/deep/mod.rs"],
      ["src/main.rs", "src/deep/inner.rs"],
      ["src/deep/mod.rs", "src/deep/inner.rs"],
    ],
    declares: ["main", "go", "Held", "deeply"],
    reaches: [
      ["src/main.rs#main", "src/helper.rs#go"],
      ["src/main.rs#main", "src/deep/inner.rs#deeply"],
    ],
  },
  {
    lang: "python",
    files: {
      "pyproject.toml": '[project]\nname = "fix"\ndependencies = ["requests >= 2"]\n',
      "app/__init__.py": "",
      "app/main.py":
        "from .util import helper\nfrom app.deep import deeply\n\ndef go():\n    return helper() + deeply()\n",
      "app/util.py": "def helper():\n    return 1\n\nclass Held:\n    pass\n",
      "app/deep.py": "def deeply():\n    return 2\n",
    },
    edges: [
      ["app/main.py", "app/util.py"],
      ["app/main.py", "app/deep.py"],
    ],
    declares: ["go", "helper", "Held", "deeply"],
    reaches: [
      ["app/main.py#go", "app/util.py#helper"],
      ["app/main.py#go", "app/deep.py#deeply"],
    ],
  },
  {
    lang: "jvm",
    files: {
      "build.gradle": 'dependencies {\n  implementation("androidx.core:core-ktx:1.0.0")\n}\n',
      "app/src/main/java/com/a/Main.kt":
        "package com.a\n\nimport com.a.deep.Deeply\n\nclass Main {\n  fun go() = Helper().run() + Deeply().deep()\n}\n",
      "app/src/main/java/com/a/Helper.kt": "package com.a\n\nclass Helper {\n  fun run() = 1\n}\n",
      "app/src/main/java/com/a/deep/Deeply.kt":
        "package com.a.deep\n\nclass Deeply {\n  fun deep() = 2\n}\n",
    },
    edges: [
      ["app/src/main/java/com/a/Main.kt", "app/src/main/java/com/a/Helper.kt"],
      ["app/src/main/java/com/a/Main.kt", "app/src/main/java/com/a/deep/Deeply.kt"],
    ],
    declares: ["Main", "go", "Helper", "run", "Deeply", "deep"],
    reaches: [["app/src/main/java/com/a/Main.kt#go", "app/src/main/java/com/a/Helper.kt#run"]],
  },
  {
    lang: "c",
    files: {
      "CMakeLists.txt": "project(fix)\nadd_executable(fix src/main.c)\nfind_package(Threads)\n",
      "include/own.h": "int own(void);\n",
      "src/main.c":
        '#include <stdio.h>\n#include "own.h"\n#include "helper.h"\n\nint main(void) { return own() + helper(); }\n',
      "src/helper.h": "int helper(void);\n",
      "src/helper.c": '#include "helper.h"\n\nint helper(void) { return 1; }\n',
    },
    edges: [
      ["src/main.c", "include/own.h"],
      ["src/main.c", "src/helper.h"],
      ["src/helper.c", "src/helper.h"],
    ],
    declares: ["main", "helper"],
  },
  {
    lang: "go",
    files: {
      "go.mod": "module github.com/me/fix\n\ngo 1.22\n\nrequire github.com/pkg/errors v0.9.1\n",
      "main.go":
        'package main\n\nimport (\n\t"fmt"\n\t"github.com/me/fix/util"\n)\n\nfunc main() {\n\tfmt.Println(util.Go())\n}\n',
      "util/util.go": "package util\n\nfunc Go() int { return 1 }\n\ntype Held struct{}\n",
    },
    edges: [["main.go", "util/util.go"]],
    declares: ["main", "Go", "Held"],
  },
]

for (const one of FIXTURES)
  test(`${one.lang}: a small repo resolves the edges it should`, () => {
    const dir = repo(one.files)
    const graph = build(dir)

    for (const [from, to] of one.edges)
      assert.ok(
        graph.modules[from]?.out.some((edge) => edge.to === to),
        `${one.lang}: ${from} should import ${to}, found ${JSON.stringify(graph.modules[from]?.out.map((e) => e.to))}`,
      )

    const found = calls(dir, graph)
    const names = new Set(Object.values(found.symbols).map((s) => s.name))
    for (const name of one.declares)
      assert.ok(names.has(name), `${one.lang}: ${name} should be declared`)

    for (const [from, to] of one.reaches ?? [])
      assert.ok(
        found.symbols[from]?.calls.includes(to),
        `${one.lang}: ${from} should reach ${to}, reaches ${JSON.stringify(found.symbols[from]?.calls)}`,
      )

    // nothing this repo declares itself may read as a call into a package
    for (const one_ of Object.values(graph.modules))
      assert.ok(
        !one_.packages.some((pkg) => Object.keys(graph.modules).some((p) => p.includes(pkg))),
        `${one.lang}: a file of this repo was counted as an outside package`,
      )
  })

test("a string or a comment cannot invent an import in any language", () => {
  const cases: [string, string][] = [
    ["a.rs", 'let s = "use fake::thing;";\n// use commented::out;\nuse real::one;'],
    ["a.py", 'x = "import fake"\n# import commented\nimport real'],
    ["a.go", 'var s = "github.com/fake/pkg"\nimport "real/pkg"'],
    ["a.c", 'const char *s = "#include <fake.h>";\n#include "real.h"'],
    ["A.kt", 'val s = "import com.fake.Thing"\nimport com.real.Thing'],
    ["a.rb", 'x = "require \'fake\'"\nrequire "real"'],
    ["a.php", '<?php\n$s = "use Fake\\\\Thing;";\nuse Real\\\\Thing;'],
  ]
  for (const [path, source] of cases) {
    const found = foreign(source, dialectOf(path)!).map((one) => one.text)
    assert.ok(
      !found.some((one) => /fake|commented/i.test(one)),
      `${path}: a string or comment was read as an import, found ${JSON.stringify(found)}`,
    )
    assert.ok(found.length, `${path}: the real import was lost`)
  }
})

test("every language desprawl claims is one it can actually read", () => {
  const one: Record<string, string> = {
    "a.rs": "fn go() {}",
    "b.py": "def go(): pass",
    "C.kt": "class A {}",
    "d.c": "int go(void) { return 0; }",
    "e.go": "package main\nfunc go() {}",
    "f.swift": "func go() {}",
    "G.cs": "public class A { }",
    "h.rb": "def go\nend",
    "i.php": "<?php\nfunction go() {}",
    "j.ts": "export const go = () => 1",
  }
  const dir = repo(one)
  const graph = build(dir)
  const langs = new Set(Object.values(graph.modules).map((m) => m.lang))
  assert.equal(langs.size, LANGUAGES.length, `read ${[...langs].sort().join(",")}`)
  const found = calls(dir, graph)
  for (const path of Object.keys(one))
    assert.ok(
      Object.values(found.symbols).some((s) => s.file === path && s.kind !== "module"),
      `${path} declared nothing`,
    )
})
