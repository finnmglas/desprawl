// owner: finn
// goal: the totals a folder reports are the files below it, nothing more or less

import assert from "node:assert/strict"
import { test } from "node:test"
import { analyze } from "../src/analyze.ts"
import { child, inRepo, repo } from "./repo.ts"

const line = "const a = 1\n"

const dir = repo({
  "root.ts": line,
  "src/a.ts": line.repeat(2),
  "src/deep/b.ts": line.repeat(3),
  "src/deep/c.py": "x = 1\n",
})

test("a folder totals the files under it, however deep", () => {
  const s = analyze(dir)
  const src = child(s.tree, "src")
  assert.equal(src.code, 6, "2 + 3 + 1")
  assert.equal(src.files, 3)
  const deep = child(src as never, "deep")
  assert.equal(deep.code, 4)
  assert.equal(deep.files, 2)
})

test("the repo total is every file, counted once", () => {
  const s = analyze(dir)
  assert.equal(s.code, 7)
  assert.equal(s.files, 4)
  const leaves = (n: (typeof s)["tree"]): number =>
    n.children ? n.children.reduce((a, c) => a + leaves(c), 0) : 1
  assert.equal(leaves(s.tree), s.files, "the tree holds exactly as many files as the total says")
})

test("languages add up to the same total as the tree", () => {
  const s = analyze(dir)
  assert.equal(
    s.languages.reduce((a, l) => a + l.code, 0),
    s.code,
  )
  assert.deepEqual(s.languages.map((l) => l.name).sort(), ["Python", "TypeScript"])
})

test("a folder carries the languages of its children", () => {
  const s = analyze(dir)
  const src = child(s.tree, "src") as never as { langs: Record<string, number> }
  assert.deepEqual(src.langs, { TypeScript: 5, Python: 1 })
})

test("remotes are normalised to something a browser can open", () => {
  for (const form of [
    "git@github.com:finnmglas/desprawl.git",
    "ssh://git@github.com/finnmglas/desprawl.git",
    "https://github.com/finnmglas/desprawl.git",
  ]) {
    const one = repo({ "a.ts": line })
    inRepo(one, "remote", "add", "origin", form)
    const [remote] = analyze(one).remotes
    assert.equal(remote.url, "https://github.com/finnmglas/desprawl", form)
    assert.equal(remote.host, "github")
  }
})

test("a repo with no remote says so, rather than inventing one", () => {
  assert.deepEqual(analyze(repo({ "a.ts": line })).remotes, [])
})
