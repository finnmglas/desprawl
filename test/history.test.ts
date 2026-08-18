// owner: finn
// goal: what the log says about who touched what, and when

import assert from "node:assert/strict"
import { test } from "node:test"
import { analyze } from "../src/facts/analyze.ts"
import { detail } from "../src/facts/history.ts"
import { timeline } from "../src/facts/samples.ts"
import { child, inRepo, repo } from "./repo.ts"

test("an index in the payload names a contributor id, and an address says whose it is", () => {
  const dir = repo(
    { files: { "a.ts": "export const a = 1\n" }, author: "Ann Smith <ann@a.io>" },
    { files: { "a.ts": "export const a = 2\n" }, author: "Ann Smith <ann@work.io>" },
    { files: { "b.ts": "export const b = 1\n" }, author: "Bo <bo@b.io>" },
  )
  const s = analyze(dir)
  const people = new Map(s.contributors.map((one) => [one.id, one]))
  assert.deepEqual(
    s.contributors.map((one) => one.id),
    s.contributors.map((_, i) => i),
    "a person's id is where they sit, so an old reader that counted rows still lands",
  )
  assert.ok(
    s.identities.length > s.contributors.length,
    "Ann committed under two addresses, so there are more identities than people",
  )
  for (const one of s.identities)
    assert.ok(people.has(one.id), `${one.email} points at a person nobody has`)
  const ann = s.identities.filter((one) => one.email.startsWith("ann@"))
  assert.equal(new Set(ann.map((one) => one.id)).size, 1, "both her addresses fold into one row")
  for (const commit of s.log) assert.ok(people.has(commit.who), "and a commit names a person")
})

test("a path git quotes still gets its commits and churn", () => {
  const s = analyze(repo({ "grüße.ts": "a\n" }, { "grüße.ts": "a\nb\n" }))
  assert.equal(child(s.tree, "grüße.ts").commits, 2)
  assert.equal(child(s.tree, "grüße.ts").insertions, 2)
})

test("a path with spaces gets its commits too", () => {
  const s = analyze(repo({ "two words.ts": "a\n" }))
  assert.equal(child(s.tree, "two words.ts").commits, 1)
})

test("one broken clock cannot invert the range", () => {
  const s = analyze(
    repo({ files: { "a.ts": "a\n" }, when: "2099-01-01T00:00:00Z" }, { files: { "a.ts": "b\n" } }),
  )
  assert.ok(s.first <= s.last, `${s.first} came after ${s.last}`)
  assert.ok(!s.first.startsWith("2099"), "an unbelievable date named the start")
})

test("a repo where every clock is wrong still reports a range", () => {
  const s = analyze(repo({ files: { "a.ts": "a\n" }, when: "2099-01-01T00:00:00Z" }))
  assert.ok(s.first && s.last)
})

test("the all time pass drops dates outside the believable window", () => {
  const dir = repo(
    { files: { "a.ts": "a\n" }, when: "1970-01-01T00:00:01Z" },
    { files: { "a.ts": "b\n" }, when: "2099-01-01T00:00:00Z" },
    { files: { "a.ts": "c\n" } },
  )
  const t = timeline(dir)
  assert.equal(t.total, 3, "every commit is still counted")
  assert.ok(t.first >= "1991" && t.last <= "2027", `${t.first} to ${t.last}`)
})

test("contributors merge on email, not on the name they used", () => {
  const s = analyze(
    repo(
      { files: { "a.ts": "a\n" }, author: "Finn <f@example.com>" },
      { files: { "a.ts": "b\n" }, author: "finnmglas <f@example.com>" },
    ),
  )
  assert.equal(s.contributors.length, 1)
  assert.equal(s.contributors[0].commits, 2)
})

test("a name that clearly repeats under another email folds in too", () => {
  const s = analyze(
    repo(
      { files: { "a.ts": "a\n" }, author: "Vivek <vivek@example.com>" },
      { files: { "a.ts": "b\n" }, author: "VivekSGopalakrishnan <v2@example.com>" },
    ),
  )
  assert.equal(s.contributors.length, 1)
  assert.equal(s.contributors[0].commits, 2)
  assert.equal(s.contributors[0].also?.length, 1)
})

test("two short or unrelated names never merge on a coincidence", () => {
  const s = analyze(
    repo(
      { files: { "a.ts": "a\n" }, author: "Ann <ann@example.com>" },
      { files: { "a.ts": "b\n" }, author: "Anna Smith <anna@example.com>" },
      { files: { "a.ts": "c\n" }, author: "Bob <bob@example.com>" },
    ),
  )
  assert.equal(s.contributors.length, 3, "Ann is too short to bridge two different people")
})

test("a bot-signing identity is labelled, not folded in as a person", () => {
  const s = analyze(
    repo(
      { files: { "a.ts": "a\n" }, author: "Cursor Agent <cursoragent@cursor.com>" },
      { files: { "a.ts": "b\n" }, author: "Finn <f@example.com>" },
    ),
  )
  const bot = s.contributors.find((c) => c.email === "cursoragent@cursor.com")
  assert.equal(bot?.bot, "Cursor")
  assert.equal(s.contributors.find((c) => c.email === "f@example.com")?.bot, undefined)
})

test("a rename carries its history, it is not a new file", () => {
  const dir = repo({ "old.ts": "a\nb\nc\n" })
  inRepo(dir, "mv", "old.ts", "new.ts")
  inRepo(dir, "-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-qm", "rename")
  const s = analyze(dir)
  assert.equal(child(s.tree, "new.ts").commits, 2)
  assert.equal(child(s.tree, "old.ts"), undefined)
})

test("a commit reports the files it touched", () => {
  const dir = repo({ "a.ts": "x\n" }, { "a.ts": "x\ny\n", "b.ts": "z\n" })
  const head = inRepo(dir, "rev-parse", "HEAD").trim()
  const one = detail(dir, head)
  assert.deepEqual(one.files.map((f) => f.path).sort(), ["a.ts", "b.ts"])
  assert.equal(
    one.files.reduce((a, f) => a + f.ins, 0),
    2,
  )
})

test("a binary file moves no lines", () => {
  const s = analyze(repo({ "logo.png": "\0PNG", "a.ts": "x\n" }))
  assert.equal(s.insertions, 1, "only the text file counted")
})

test("the read cap is reported, not hidden", () => {
  const dir = repo({ "a.ts": "1\n" }, { "a.ts": "2\n" }, { "a.ts": "3\n" })
  const capped = analyze(dir, 2)
  assert.equal(capped.commits, 2)
  assert.equal(capped.truncated, true)
  assert.equal(analyze(dir).truncated, false)
})
