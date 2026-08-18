// owner: finn
// goal: what counts as a line, and as a language

import assert from "node:assert/strict"
import { test } from "node:test"
import { execFileSync } from "node:child_process"
import { scan } from "../src/read/scan.ts"
import { repo } from "./repo.ts"

const langs = (dir: string) => Object.fromEntries(scan(dir).map((f) => [f.name, f]))

test("code, comment and blank are counted apart", () => {
  const f = langs(repo({ "a.ts": "const a = 1\n\n// note\n/* two\n   lines */\nconst b = 2\n" }))
  assert.deepEqual(
    { code: f["a.ts"].code, comment: f["a.ts"].comment, blank: f["a.ts"].blank },
    { code: 2, comment: 3, blank: 1 },
  )
})

test("a hash language reads # as its comment, not //", () => {
  const f = langs(repo({ "s.py": "# note\nx = 1\n// not a comment here\n" }))
  assert.equal(f["s.py"].comment, 1)
  assert.equal(f["s.py"].code, 2)
})

test("crlf counts the same as lf, so windows reports what linux does", () => {
  const f = langs(repo({ "win.ts": "a\r\n\r\n// c\r\nb\r\n", "nix.ts": "a\n\n// c\nb\n" }))
  const same = (k: "code" | "comment" | "blank") => assert.equal(f["win.ts"][k], f["nix.ts"][k], k)
  same("code")
  same("comment")
  same("blank")
})

test("a document contributes no lines, but the repo is still shown to hold it", () => {
  const nul = String.fromCharCode(0)
  const f = langs(
    repo({
      "logo.png": `${nul}PNG${nul}data`,
      "report.pdf": `%PDF${nul}x`,
      "mystery.dat": `${nul}raw`,
      "a.ts": "x\n",
    }),
  )
  assert.equal(f["logo.png"].lang, "Image")
  assert.equal(f["logo.png"].code, 0, "a binary has no lines to count")
  assert.equal(f["report.pdf"].lang, "PDF")
  assert.equal(f["mystery.dat"], undefined, "an unrecognised binary stays out")
  assert.equal(f["a.ts"].code, 1)
})

test("a symlink to a fifo cannot hang the scan", { skip: process.platform === "win32" }, () => {
  const dir = repo({ "a.ts": "x\n" })
  execFileSync("mkfifo", [`${dir}/pipe`])
  execFileSync("ln", ["-s", "pipe", `${dir}/link.ts`])
  execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" })
  // the assertion is that this returns at all
  assert.equal(scan(dir).length, 1)
})

test("a name desprawl knows beats the extension", () => {
  const f = langs(repo({ Makefile: "all:\n\techo\n", "CMakeLists.txt": "project(x)\n" }))
  assert.equal(f["Makefile"].lang, "Make")
  assert.equal(f["CMakeLists.txt"].lang, "CMake")
})

test("a shebang names a file with no extension", () => {
  const f = langs(repo({ run: "#!/usr/bin/env bash\necho hi\n", LICENSE: "MIT\n" }))
  assert.equal(f["run"].lang, "Shell")
  // prose with no extension and no shebang stays out of the counts
  assert.equal(f["LICENSE"], undefined)
})

test("an extension we have never seen is still counted, under its own name", () => {
  const f = langs(repo({ "board.weird": "one\ntwo\n" }))
  assert.equal(f["board.weird"].lang, "weird")
  assert.equal(f["board.weird"].code, 2)
})

test("indentation is measured, since the nest column depends on it", () => {
  const f = langs(repo({ "a.ts": "a\n  b\n    c\n\td\n" }))
  // two spaces or one tab is one level: 0 + 1 + 2 + 1
  assert.equal(f["a.ts"].indent, 4)
  assert.equal(f["a.ts"].code, 4)
})

test("a block comment that opens and closes on one line does not swallow the file", () => {
  const f = langs(repo({ "a.ts": "/* one */\nconst a = 1\nconst b = 2\n" }))
  assert.equal(f["a.ts"].comment, 1)
  assert.equal(f["a.ts"].code, 2)
})

test("markup uses its own comment marker", () => {
  const f = langs(repo({ "a.html": "<!-- note -->\n<div></div>\n" }))
  assert.equal(f["a.html"].comment, 1)
  assert.equal(f["a.html"].code, 1)
})
