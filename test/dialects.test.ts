// owner: finn
// goal: every language desprawl reads, read the way that language is written

import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "../src/read/graph.ts"
import { calls } from "../src/read/calls.ts"
import { candidates, dialectOf } from "../src/read/dialects.ts"
import { declared, foreign, scrub } from "../src/read/specifiers.ts"
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

test("c# names a namespace however the using is written", () => {
  const said = (source: string) =>
    foreign(source, dialectOf("a.cs")!)
      .map((one) => one.text)
      .sort()
  assert.deepEqual(
    said(
      "global using System.Linq;\nusing static System.Math;\n" +
        "using Json = Newtonsoft.Json;\nusing System.IO;\n\n" +
        "namespace App;\n\npublic class A\n{\n" +
        "    public void Go()\n    {\n        using (var x = File.Open(p)) { }\n" +
        "        using var y = File.Open(p);\n    }\n}\n",
    ),
    ["Newtonsoft.Json", "System.IO", "System.Linq", "System.Math"],
    "an alias names what it aliases, and a using statement names no namespace at all",
  )
})

test("a c# member is told from the statement written the same way", () => {
  const names = (source: string) =>
    declared(scrub(source, "c").code, dialectOf("a.cs")!).map((one) => one.name)
  assert.deepEqual(
    names(
      "public partial class Window : Base\n{\n" +
        "    public Window(ILogger log) : base(log)\n    {\n" +
        "        InitializeComponent();\n    }\n" +
        "    public async Task<List<Thing>> LoadAsync(int id) => await _repo.Get(id);\n" +
        "    private static Dictionary<string, int> Count<T>(IEnumerable<T> all)\n    {\n" +
        "        return new Dictionary<string, int>();\n    }\n" +
        "    public string Name { get; set; }\n" +
        "    public event EventHandler Changed;\n}\n",
    ),
    ["Window", "Window", "LoadAsync", "Count"],
    "a constructor, an arrow body and a generic method declare; a property and an event do not",
  )
  assert.deepEqual(
    names(
      "public interface IStore\n{\n    Task<int> Save(Item one);\n    void Clear();\n}\n" +
        "public delegate void Changed(object sender);\n" +
        "public record Person(string Name);\n",
    ),
    ["IStore", "Save", "Clear", "Changed", "Person"],
    "an interface declares without a body, and a delegate names its type before its name",
  )
  assert.deepEqual(
    names(
      "public void Go()\n{\n    return Compute(1);\n    await Client.GetAsync(url);\n" +
        "    var held = Build(x);\n    new Thread(Work).Start();\n    Debug.Assert(ok);\n}\n",
    ),
    ["Go"],
    "every line of that body is a call, and none of them declares anything",
  )
})

test("c# holds a string three ways, and the two it added are not escaped the way c is", () => {
  const one = scrub('var p = @"C:\\temp\\";\nvar q = Go();\n', "c")
  assert.deepEqual(one.strings, ["C:\\temp\\"], "a backslash is a backslash in a verbatim string")
  assert.match(one.code, /var q = /, "and the line after it is still code")
  assert.deepEqual(scrub('var s = @"a""b";', "c").strings, ['a""b'], "a doubled quote is one quote")

  const raw = scrub(
    'var sql = """\n  select * from t where x = Go()\n  """;\nvar q = Real();\n',
    "c",
  )
  assert.equal(raw.strings.length, 1, "a raw string is one string, lines and all")
  assert.doesNotMatch(raw.code, /select/, "what it holds is never read as code")
  assert.equal(raw.code.split("\n").length, 5, "and every line survives it")
})

test("markup comments with an angle bracket, so a slash in it opens nothing", () => {
  const done = scrub(
    "<Page x:Class=\"A.B\" xmlns:d='clr-namespace:A.C'>\n" +
      '  <!-- <Thing Source="gone.xaml" /> -->\n' +
      '  <Web Url="https://example.com/x" />\n</Page>\n',
    "xml",
  )
  assert.doesNotMatch(done.code, /gone/, "a commented element is not markup")
  assert.ok(done.strings.includes("https://example.com/x"), "a url is one string, slashes and all")
  assert.ok(done.strings.includes("clr-namespace:A.C"), "and a single quote holds one too")
  assert.equal(done.code.split("\n").length, 5, "every line survives")

  const said = foreign(
    '<Page x:Class="A.B" xmlns:local="clr-namespace:A.Views;assembly=A">\n' +
      '  <ResourceDictionary Source="Themes/Dark.xaml" />\n' +
      '  <Image Source="/Assets/logo.png" />\n</Page>\n',
    dialectOf("a.xaml")!,
  ).map((one) => one.text)
  assert.deepEqual(
    said.sort(),
    ["A.B", "A.Views", "Themes/Dark.xaml"],
    "a picture is not a module, and the assembly a namespace names is not part of it",
  )
})

test("a .net specifier lands under the project that declares its namespace", () => {
  const parts = new Map([
    ["App", "src/App"],
    ["Fix.Core", "src/Core"],
  ])
  const at = (from: string, text: string) => candidates(dialectOf(from)!, text, from, parts)
  assert.ok(at("src/App/Main.cs", "App.Services").includes("src/App/Services/"))
  assert.ok(at("src/App/Main.cs", "Fix.Core.Models").includes("src/Core/Models/"))
  // nothing here declares that root, so the repo's own folders are all there is to try
  assert.ok(at("src/App/Main.cs", "Other.Thing").includes("Other/Thing.cs"))
  assert.ok(
    at("src/App/MainWindow.xaml", "App.MainWindow").includes("src/App/MainWindow.xaml.cs"),
    "x:Class is the file behind this one",
  )
  assert.ok(
    at("src/App/MainWindow.xaml", "pack://application:,,,/App;component/Themes/Dark.xaml").includes(
      "src/App/Themes/Dark.xaml",
    ),
    "a pack uri is a path with an assembly in front of it",
  )
})

test("a single file component is the script in it, and never the markup around it", () => {
  const dir = repo({
    "package.json": '{"name":"app"}',
    "src/api.js": "export const load = () => 1\nexport const hidden = () => 2\n",
    "src/Card.vue": [
      "<template>",
      '  <div class="card" @click="load()">{{ title }}</div>',
      "  <img :src=\"require('./nope.png')\" />",
      "</template>",
      "",
      "<script setup>",
      'import { load } from "./api.js"',
      "const props = defineProps({ title: String })",
      "function open() {",
      "  return load()",
      "}",
      "</script>",
      "",
      "<style>.card { color: red }</style>",
      "",
    ].join("\n"),
  })
  const graph = build(dir)
  assert.ok(graph.modules["src/Card.vue"], "a component is a module")
  assert.deepEqual(
    graph.modules["src/Card.vue"].out.map((e) => e.to),
    ["src/api.js"],
    "its script imports, and nothing the template says does",
  )
  assert.ok(graph.modules["src/Card.vue"].symbols.declares > 0, "and it declares its own")
  assert.equal(graph.modules["src/Card.vue"].barrel, false, "a component is not a barrel")

  const found = calls(dir, graph)
  assert.ok(
    found.symbols["src/Card.vue#open"]?.calls.includes("src/api.js#load"),
    `open should reach load, reaches ${JSON.stringify(found.symbols["src/Card.vue#open"]?.calls)}`,
  )
  assert.ok(
    !found.unresolved.some((one) => one.name === "defineProps" || one.name === "require"),
    "a compiler macro is the framework's own word, and a template calls nothing",
  )
  // the lines a panel points at have to be the lines in the file
  assert.equal(found.symbols["src/Card.vue#open"]?.line, 9)
})
