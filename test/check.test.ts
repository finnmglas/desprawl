// owner: finn
// goal: a diff answers for what it added, never for what the repo already held

import assert from "node:assert/strict"
import { test } from "node:test"
import { check } from "../src/check.ts"
import { repo } from "./repo.ts"

test("a cycle the branch added is named, one it inherited is not", () => {
  const dir = repo(
    // already looping before anyone touched it
    { "a.ts": "import './b.ts'\n", "b.ts": "import './a.ts'\n", "c.ts": "export const c = 1\n" },
    // and now a second loop, which is this diff's doing
    { "c.ts": "import './d.ts'\n", "d.ts": "import './c.ts'\n" },
  )
  const found = check(dir, "HEAD~1")

  const loops = found.counts.find((one) => one.name === "import cycles")!
  assert.equal(loops.was, 1, "the base already had one")
  assert.equal(loops.now, 2)
  assert.equal(loops.added, 1, "only the new one counts")
  assert.match(loops.which[0], /c\.ts/)
  assert.ok(found.worse)
})

test("a diff that adds nothing structural passes", () => {
  const dir = repo(
    { "a.ts": "import './b.ts'\n", "b.ts": "import './a.ts'\n" },
    { "a.ts": "import './b.ts'\nexport const more = 1\n" },
  )
  const found = check(dir, "HEAD~1")
  assert.equal(found.worse, false)
  for (const one of found.counts) assert.equal(one.added, 0, one.name)
})

test("an unresolved import the branch introduced is named", () => {
  const dir = repo(
    { "a.ts": "export const a = 1\n" },
    { "a.ts": "import './gone.ts'\nexport const a = 1\n" },
  )
  const found = check(dir, "HEAD~1")
  const missing = found.counts.find((one) => one.name === "unresolved imports")!
  assert.equal(missing.added, 1)
  assert.match(missing.which[0], /gone\.ts/)
  assert.ok(found.worse)
})

test("a ref nobody has is said plainly", () => {
  const dir = repo({ "a.ts": "export const a = 1\n" })
  assert.throws(() => check(dir, "no-such-branch"), /no-such-branch/)
})
