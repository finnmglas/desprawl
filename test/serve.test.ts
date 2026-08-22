// owner: finn
// goal: the local server hands data to this tab and to nobody else

import assert from "node:assert/strict"
import { after, test } from "node:test"
import { serve } from "../src/serve/serve.ts"
import { execFileSync } from "node:child_process"
import { before, forget } from "../src/facts/before.ts"
import { folder, repo } from "./repo.ts"

const dir = repo({ "a.ts": "const a = 1\n", "src/b.ts": "const b = 2\n" })
const url = await serve(dir, undefined, true, 0, "<html>the built viewer</html>")
const base = url.slice(0, url.indexOf("/?"))
const token = url.slice(url.indexOf("t=") + 2)
const get = (path: string) => fetch(`${base}${path}`, { headers: { origin: base } })

after(() => process.exit(0)) // the server holds the loop open

test("no token, no data, not even the page", async () => {
  assert.equal((await get("/")).status, 401)
  assert.equal((await get("/api/stats")).status, 401)
  assert.equal((await get(`/api/stats?t=${token}wrong`)).status, 401)
})

test("another page may not read it, even knowing the port", async () => {
  const res = await fetch(`${base}/api/stats?t=${token}`, {
    headers: { origin: "http://evil.test" },
  })
  assert.equal(res.status, 403)
})

test("the page it was given is the page it hands out", async () => {
  const res = await get(`/?t=${token}`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /the built viewer/)
})

test("without a built viewer the data still flows, and the page says why", async () => {
  const bare = await serve(dir, undefined, true, 0, "")
  const at = bare.slice(0, bare.indexOf("/?"))
  const key = bare.slice(bare.indexOf("t=") + 2)
  const page = await fetch(`${at}/?t=${key}`, { headers: { origin: at } })
  assert.equal(page.status, 500)
  assert.match(await page.text(), /pnpm build/)
  assert.equal((await fetch(`${at}/api/stats?t=${key}`, { headers: { origin: at } })).status, 200)
})

test("the stats come back for this tab", async () => {
  const stats = await (await get(`/api/stats?t=${token}`)).json()
  assert.equal(stats.code, 2)
  assert.equal(stats.repo, dir)
})

test("a folder that is not there answers with a reason, not an empty list", async () => {
  const res = await get(`/api/files?t=${token}&path=nope/deep`)
  assert.equal(res.status, 404)
  assert.match((await res.json()).error, /no folder at/)
})

test("a folder that is there lists its files", async () => {
  const files = await (await get(`/api/files?t=${token}&path=src`)).json()
  assert.deepEqual(
    files.map((f: { name: string }) => f.name),
    ["b.ts"],
  )
})

test("a tracked file comes back to be read", async () => {
  const one = await (await get(`/api/source?t=${token}&path=src/b.ts`)).json()
  assert.equal(one.text, "const b = 2\n")
  assert.equal(one.binary, false)
  assert.equal(one.clipped, false)
})

test("only what git tracks can be read, whatever the path says", async () => {
  for (const path of ["../../etc/passwd", "/etc/passwd", "src/../../etc/passwd", "nope.ts"]) {
    const res = await get(`/api/source?t=${token}&path=${encodeURIComponent(path)}`)
    assert.equal(res.status, 404, path)
    assert.match((await res.json()).error, /no file this repo tracks/)
  }
})

test("a tracked symlink is not a way out of the repo", async () => {
  const out = repo({ "escape.txt": "symlink:/etc/passwd", "a.ts": "const a = 1\n" })
  const url = await serve(out, undefined, true, 0, "")
  const at = url.slice(0, url.indexOf("/?"))
  const key = url.slice(url.indexOf("t=") + 2)
  const res = await fetch(`${at}/api/source?t=${key}&path=escape.txt`, { headers: { origin: at } })
  assert.equal(res.status, 404)
})

test("a binary file says so rather than arriving as mojibake", async () => {
  const pics = repo({ "logo.png": "\0PNG", "a.ts": "const a = 1\n" })
  const url = await serve(pics, undefined, true, 0, "")
  const at = url.slice(0, url.indexOf("/?"))
  const key = url.slice(url.indexOf("t=") + 2)
  const one = await (
    await fetch(`${at}/api/source?t=${key}&path=logo.png`, { headers: { origin: at } })
  ).json()
  assert.equal(one.binary, true)
  assert.equal(one.text, "")
})

test("a failure explains itself in the body", async () => {
  const res = await get(`/api/commit?t=${token}&hash=abcdef`)
  assert.equal(res.status, 500)
  assert.equal((await res.json()).error, "no such commit in this repository")
})

test("settings are small, and a body that is not settings is refused", async () => {
  const res = await fetch(`${base}/api/prefs?t=${token}`, {
    method: "PUT",
    headers: { origin: base },
    body: "x".repeat(70_000),
  }).catch(() => ({ status: 413 }) as Response)
  assert.equal(res.status, 413)
  // the server is still answering afterwards
  assert.equal((await get(`/api/stats?t=${token}`)).status, 200)
})

test("the url carries the token, so no request may carry the url", async () => {
  assert.equal((await get(`/?t=${token}`)).headers.get("referrer-policy"), "no-referrer")
})

test("a second read of the same head is the same object, a refresh is not", async () => {
  const first = await (await get(`/api/stats?t=${token}`)).json()
  const cached = await (await get(`/api/stats?t=${token}`)).json()
  assert.equal(first.head, cached.head)
  const fresh = await (await get(`/api/stats?t=${token}&fresh`)).json()
  assert.equal(fresh.head, first.head, "a refresh re-reads, it does not change the commit")
})

test("older commits page without repeating themselves", async () => {
  const page = async (skip: number, count: number) =>
    (await (await get(`/api/log?t=${token}&skip=${skip}&count=${count}`)).json()) as {
      hash: string
    }[]
  const all = await page(0, 10)
  const second = await page(1, 10)
  assert.ok(all.length >= 1)
  assert.deepEqual(second, all.slice(1), "a page is a window on the same log")
})

test("the true commit count is not the capped one", async () => {
  const { commits } = await (await get(`/api/count?t=${token}`)).json()
  const stats = await (await get(`/api/stats?t=${token}`)).json()
  assert.equal(commits, stats.commits)
})

test("what a repo came to at an older commit, read off a checkout of it", () => {
  const dir = repo(
    { "src/a.ts": "// one\nexport const go = () => 1\n" },
    {
      "src/a.ts": "// one\n// two\nexport const go = () => 1\n",
      "src/b.ts": "import './a.ts'\nexport const two = () => 2\n",
    },
  )
  // the fixture dates its commits a day apart, so the window is measured from the second
  const day = 86_400_000
  const second = Date.parse("2026-01-02T12:00:00Z")
  const held = before(dir, (Date.now() - second) / day + 0.5, "size")?.size
  assert.ok(held, "a repo with history has a commit to compare against")
  assert.equal(held.files, 1, "one file then, two now")
  assert.equal(held.comment, 1, "and one comment line, before the second was written")

  // and the graph it asks for next comes off the same checkout, not a second one
  const graph = before(dir, (Date.now() - second) / day + 0.5, "graph")
  assert.ok(graph?.at, "it names the commit it read")
  assert.equal(Object.keys(graph.graph!.modules).length, 1)
  assert.equal(graph.graph!.stats.edges, 0, "b.ts did not exist to import a.ts")

  // a window older than the repo compares against nothing, which is what it was
  const none = before(dir, 4000, "size")
  assert.deepEqual(
    { at: none?.at, files: none?.size?.files, code: none?.size?.code },
    { at: "", files: 0, code: 0 },
  )
  assert.equal(before(dir, 0, "size"), null, "no window is no reading")
  // one checkout per commit, however many readings and windows came off it
  assert.equal(
    execFileSync("git", ["worktree", "list"], { cwd: dir, encoding: "utf8" }).trim().split("\n")
      .length,
    2,
  )
  forget()
  // and nothing left behind once the run is done with it
  assert.equal(
    execFileSync("git", ["worktree", "list"], { cwd: dir, encoding: "utf8" }).trim().split("\n")
      .length,
    1,
  )
})

test("the before endpoint answers with a window, and refuses one it cannot read", async () => {
  const bad = await get(`/api/before?days=0&t=${token}`)
  assert.equal(bad.status, 400, "no window is not a reading")
  const wide = await get(`/api/before?days=9999&t=${token}`)
  assert.equal(wide.status, 400, "and neither is a window past what a repo can hold")
  const held = await get(`/api/before?days=30&t=${token}`)
  assert.equal(held.status, 200)
  const said = (await held.json()) as { size?: { files: number } } | null
  assert.ok(typeof said?.size?.files === "number", "it answers with the numbers of that day")
  const wrong = await get(`/api/before?days=30&want=nonsense&t=${token}`)
  assert.equal(wrong.status, 400, "and only with a reading it knows how to take")
})

test("a folder of repos gets no arrows until a reader picks one of them", async () => {
  const dir = folder({
    one: [{ "a.ts": "export const a = 1\n" }],
    two: [{ "b.ts": "export const b = 2\n" }],
  })
  const at = await serve(dir, undefined, true, 0, "<html>x</html>")
  const root = at.slice(0, at.indexOf("/?"))
  const t = at.slice(at.indexOf("t=") + 2)
  const ask = (query: string) =>
    fetch(`${root}/api/before?days=3000&t=${t}${query}`, { headers: { origin: root } })

  const all = await (await ask("")).json()
  assert.equal(all, null, "the cards add both repos up, and one checkout is not that")
  const one = await (await ask("&repo=one")).json()
  assert.ok(one && typeof one === "object", "a repo named is a repo that can be read")
})
