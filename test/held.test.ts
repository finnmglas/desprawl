// owner: finn
// goal: read once, and never past the edit

import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { forget, reading, scrubbed } from "../src/read/held.ts"

test("a file is read once, and again the moment it changes on disk", () => {
  forget()
  const dir = mkdtempSync(join(tmpdir(), "desprawl-held-"))
  const file = join(dir, "a.ts")
  writeFileSync(file, "// one\nexport const go = () => 1\n")
  assert.match(reading(file), /export const go/)
  assert.equal(scrubbed(file).code.includes("one"), false, "a comment is not code")
  // the same answer, off the same read
  assert.equal(scrubbed(file).code, scrubbed(file).code)

  writeFileSync(file, "export const go = () => 2\n")
  utimesSync(file, new Date(), new Date(Date.now() + 1000))
  assert.match(reading(file), /=> 2/, "a live server reanalyses what is on disk now")
  assert.match(scrubbed(file).code, /=> 2/)

  // and a path spelled two ways is one file
  assert.equal(reading(join(dir, ".", "a.ts")), reading(file))
  assert.equal(reading(join(dir, "gone.ts")), "", "nothing to read is not a crash")
  forget()
})
