// owner: finn
// goal: every language desprawl reads, read the way that language is written

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/graph.ts"
import { calls } from "../src/calls.ts"
import { candidates, dialectOf } from "../src/dialects.ts"
import { foreign, scrub } from "../src/specifiers.ts"
import { repo } from "./repo.ts"

test("a comment, a string and a char are read the way each language writes them", () => {
  const rust = scrub(
    `fn hold<'a>(x: &'a str) -> u8 {\n  let c = 'x';\n  let s = r#"a "quoted" one"#;\n  // gone\n  1\n}`,
    "c",
  )
  assert.equal(rust.code.split("\n").length, 6, "every line survives")
  assert.deepEqual(rust.strings, ['a "quoted" one'], "a raw string is one string")
  assert.match(rust.code, /fn hold< a>/, "a lifetime opens nothing")

  const py = scrub(`import os  # gone\ndef go():\n    """doc\n    lines"""\n    return 'x'`, "py")
  assert.equal(py.code.split("\n").length, 5, "a docstring keeps the lines it spans")
  assert.doesNotMatch(py.code, /gone/)

  // # is a directive in c, never a comment
  const c = scrub('#include "local.h"\nint x = 1;', "c")
  assert.match(c.code, /#include/)
})

test("each language names what it imports in its own words", () => {
  // by pattern, not by line: the order says nothing
  const said = (path: string, source: string) =>
    foreign(source, dialectOf(path)!)
      .map((s) => s.text)
      .sort()
  assert.deepEqual(said("a.rs", "use crate::a::{b, c};\nmod helper;"), [
    "crate::a",
    "crate::a::b",
    "crate::a::c",
    "helper",
  ])
  assert.deepEqual(said("a.py", "from .thing import One\nimport a.b"), [".thing", "a.b"])
  assert.deepEqual(said("A.kt", "import com.app.Helper"), ["com.app.Helper"])
  assert.deepEqual(said("a.c", '#include <stdio.h>\n#include "own.h"'), ["own.h", "stdio.h"])
  // a go string is an import only on an import line or inside the block
  assert.deepEqual(
    said(
      "a.go",
      'import "fmt"\nimport (\n\t"os"\n\tx "net/http"\n)\nfunc f() string {\n\treturn "hello"\n}\nvar s = []string{\n\t"one",\n\t"two",\n}',
    ),
    ["fmt", "net/http", "os"],
  )
})

test("a specifier lands where that language would look for it", () => {
  const at = (from: string, text: string) => candidates(dialectOf(from)!, text, from)
  // a rust file is a module, so super names the folder and a sibling of it
  assert.ok(at("src/a/b.rs", "super::c").includes("src/a/c.rs"))
  assert.ok(at("src/a/b.rs", "crate::x").includes("src/x.rs"))
  assert.ok(at("app/x.py", ".thing").includes("app/thing.py"))
  assert.ok(at("app/x.py", "a.b").includes("a/b.py"))
  assert.ok(at("src/main/kotlin/App.kt", "com.a.B").includes("com/a/B.kt"))
  assert.ok(at("src/main.c", "own.h").includes("src/own.h"))
})

test("a rust crate is one graph, however many files its modules sit in", () => {
  const dir = repo({
    "Cargo.toml": '[package]\nname = "thing"\n',
    "src/main.rs": "mod helper;\nuse crate::deep::one;\nfn main() { helper::go(); one(); }\n",
    "src/helper.rs": "pub fn go() -> u8 { 1 }\n",
    "src/deep/mod.rs": "pub fn one() -> u8 { 2 }\n",
  })
  const graph = build(dir)
  assert.equal(Object.keys(graph.modules).length, 3, "a manifest is not a module")
  const main = graph.modules["src/main.rs"]
  assert.deepEqual(
    main.out.map((e) => e.to).sort(),
    ["src/deep/mod.rs", "src/helper.rs"],
    "a mod and a crate path both land",
  )
  const found = calls(dir, graph)
  const go = Object.values(found.symbols).find((s) => s.name === "go")
  assert.ok(go, "rust declarations are found")
  assert.equal(go.lang, "rust")
  assert.ok(go.callers.length, "and main reaches it")
})

test("python and the jvm are read too, each by its own rule", () => {
  const py = repo({
    "app/__init__.py": "",
    "app/main.py": "from .util import helper\n\ndef go():\n    return helper()\n",
    "app/util.py": "def helper():\n    return 1\n",
  })
  const graph = build(py)
  assert.deepEqual(
    graph.modules["app/main.py"].out.map((e) => e.to),
    ["app/util.py"],
  )
  assert.ok(Object.values(calls(py, graph).symbols).some((s) => s.name === "helper"))

  // a class beside another needs no import on the jvm, and is still an edge
  const kt = repo({
    "app/src/main/java/com/a/One.kt": "package com.a\n\nclass One {\n  fun go() = Two().run()\n}\n",
    "app/src/main/java/com/a/Two.kt": "package com.a\n\nclass Two {\n  fun run() = 1\n}\n",
  })
  const jvm = build(kt)
  assert.deepEqual(
    jvm.modules["app/src/main/java/com/a/One.kt"].out.map((e) => e.to),
    ["app/src/main/java/com/a/Two.kt"],
    "a sibling it names is a sibling it leans on",
  )
})

test("a mixed repo is one graph, and each language can be read alone", () => {
  const dir = repo({
    "package.json": '{"name":"mixed"}',
    "src/one.ts": 'import { two } from "./two.ts"\nexport const one = () => two()\n',
    "src/two.ts": "export const two = () => 1\n",
    "Cargo.toml": '[package]\nname = "mixed"\n',
    "src/main.rs": "mod helper;\nfn main() { helper::go(); }\n",
    "src/helper.rs": "pub fn go() -> u8 { 1 }\n",
  })
  const graph = build(dir)
  const langs = new Set(Object.values(graph.modules).map((m) => m.lang))
  assert.deepEqual([...langs].sort(), ["rust", "ts"])
  assert.equal(graph.modules["src/main.rs"].out.length, 1, "rust edges land")
  assert.equal(graph.modules["src/one.ts"].out.length, 1, "and the typescript ones still do")
})

test("what a language owns is not a call to something missing", () => {
  const dir = repo({
    "Cargo.toml": '[package]\nname = "x"\n',
    "src/main.rs":
      'fn main() {\n  let v = Some(1);\n  for i in 0..3 { println!("{}", i); }\n  match v { Some(n) => n, None => 0 };\n}\n',
  })
  const found = calls(dir, build(dir))
  assert.equal(found.unresolved.length, 0, "let, for, match, Some and println are the language's")
})

test("a comment nests in rust and closes on the first star slash everywhere else", () => {
  assert.doesNotMatch(scrub("/* a /* b */ still */\nfn go() {}\n", "rs").code, /still/)
  assert.match(scrub("/* a /* b */ still */\nint x;\n", "c").code, /still/)
})

test("a raw string is one string, whichever way it is fenced", () => {
  assert.deepEqual(scrub('let s = r#"a "q" one"#;', "rs").strings, ['a "q" one'])
  assert.deepEqual(scrub('auto s = R"xx(a )" one)xx";', "c").strings, ['a )" one'])
})

test("an angled include is the toolchain's unless the repo holds it", () => {
  const dir = repo({
    "include/own.h": "int own(void);\n",
    "src/main.c": "#include <stdio.h>\n#include <own.h>\nint main(void) { return own(); }\n",
  })
  const graph = build(dir)
  assert.deepEqual(
    graph.modules["src/main.c"].out.map((e) => e.to),
    ["include/own.h"],
    "the one it holds is an edge",
  )
  assert.ok(graph.modules["src/main.c"].packages.includes("stdio.h"), "the one it does not is not")
})
