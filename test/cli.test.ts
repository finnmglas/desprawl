// owner: finn
// goal: what a user is told when something is wrong, and what counts as a url

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { explain, older } from "../src/facts/needs.ts"
import { build } from "../src/read/graph.ts"
import { calls } from "../src/read/calls.ts"
import { knowledge } from "../src/facts/knowledge.ts"
import { balanced, fold } from "../src/read/layers.ts"
import { VERSION } from "../src/read/model.ts"
import { anonymous } from "../src/serve/view.ts"
import { isUrl } from "../src/serve/remote.ts"
import type { Stats } from "../src/read/model.ts"
import { VIEWS } from "../src/facts/views.ts"
import { repo } from "./repo.ts"

/** what the cli prints as json: an envelope, and the payload inside it */
function said<T>(...args: string[]): { desprawl: string; kind: string; repo: string; data: T } {
  return JSON.parse(run(...args).out) as {
    desprawl: string
    kind: string
    repo: string
    data: T
  }
}

/** the real binary, since these are the paths a person actually walks into */
function run(...args: string[]): { out: string; code: number } {
  try {
    return { out: execFileSync("node", ["src/cli.ts", ...args], { encoding: "utf8" }), code: 0 }
  } catch (err) {
    const fail = err as { stdout?: string; stderr?: string; status?: number }
    return { out: `${fail.stdout ?? ""}${fail.stderr ?? ""}`, code: fail.status ?? 1 }
  }
}

test("a path that is not there is named, not stack traced", () => {
  const { out, code } = run("cli", "/nope/not/here")
  assert.match(out, /^desprawl: no such path as/m)
  assert.equal(code, 1)
})

test("a folder that is not a repo says so", () => {
  const { out } = run("cli", mkdtempSync(join(tmpdir(), "plain-")))
  assert.match(out, /not a git repository/)
})

test("git's own wording is kept, the command we ran is not", () => {
  // prettier-ignore
  const said: [string, string][] = [
    ["fatal: Needed a single revision", "this repository has no commits yet, so there is nothing to read"],
    ["fatal: this operation must be run in a work tree", "this is a bare repository, and desprawl reads files from a working tree"],
    ["fatal: ambiguous argument 'abcdef': unknown revision or path", "no such commit in this repository"],
    ["fatal: whatever went wrong", "whatever went wrong"],
  ]
  for (const [git, plain] of said) assert.equal(explain(new Error(git)), plain, git)
})

test("junk in a number flag falls back instead of reaching git", () => {
  const { out, code } = run("cli", "--commits", "abc", repo({ "a.ts": "x\n" }))
  assert.equal(code, 0)
  assert.ok(!out.includes("NaN"))
})

test("a url is a url, a local path never is", () => {
  for (const url of ["https://github.com/a/b", "git@github.com:a/b.git", "github.com/a/b", "a/b"]) {
    assert.ok(isUrl(url), url)
  }
  for (const path of ["../other", ".", "./src", "/home/x", "src", "C:\\repos\\x"]) {
    assert.ok(!isUrl(path), path)
  }
})

test("a folder that exists wins over the owner/repo shorthand", () => {
  assert.ok(!isUrl("ui/lib"), "ui/lib exists here, so it is a path")
  assert.ok(isUrl("ui/nope"), "nothing by that name here, so it reads as a repo")
})

test("the report and the json agree on the same repo", () => {
  const dir = repo({ "a.ts": "const a = 1\n" }, { "a.ts": "const a = 1\nconst b = 2\n" })
  const json = said<Record<string, number>>("--json", dir).data
  assert.equal(json.commits, 2)
  assert.equal(json.code, 2)
  assert.match(run("cli", dir).out, /2 commits/)
})

test("a newer node is never mistaken for an older one", () => {
  // this comparison was wrong once, and refused to run on a node that was new enough
  // prettier-ignore
  const cases: [string, boolean][] = [
    ["24.13.0", false], ["22.18.0", false], ["22.19.0", false], ["22.17.9", true], ["20.11.1", true],
  ]
  for (const [have, expected] of cases) assert.equal(older(have, "22.18"), expected, have)
})

test("every view prints something a person and a parser can both read", async () => {
  for (const view of VIEWS) {
    const said = run(view, ".").out
    assert.ok(said.trim().length, `${view} printed nothing`)
    const json = run(view, ".", "--json").out
    assert.doesNotThrow(() => JSON.parse(json), `${view} --json is not json`)
  }
})

test("a filter narrows the list and never invents a row", () => {
  const all = said<{ kind: string; hits: string }[]>("tasks", ".", "--json").data
  const size = said<{ kind: string }[]>("tasks", ".", "--json", "--kind", "size").data
  assert.ok(size.length <= all.length)
  assert.ok(
    size.every((one) => one.kind === "size"),
    "a kind filter lets nothing else through",
  )
  const three = said<unknown[]>("tasks", ".", "--json", "--limit", "3").data
  assert.ok(three.length <= 3)
})

test("the architecture reads as bands of named modules, not paths", () => {
  const said = run("architecture", ".").out
  assert.match(said, /Consumable Entrypoints/)
  assert.match(said, /Core Fundaments/)
  assert.match(
    said,
    /\(src[\w/*-]*\) L\d+ \w+, [\d.k]+ lines/,
    "each row names the folder it came from",
  )
  assert.doesNotMatch(said.split("\n")[0], /\//, "the first line is the repo, not a path")
})

test("the knowledge graph comes out at whichever grain is asked for", () => {
  const rows = (grain: string) =>
    run("knowledge", ".", "--grain", grain).out.trim().split("\n").length
  assert.ok(rows("file") > rows("module"), "a file is finer than the module holding it")
  assert.ok(rows("function") > rows("file"))
  const head = run("knowledge", ".").out.split("\n")[0]
  assert.match(head, /kind\tid\tlabel/, "tab separated, so a sheet or a script can take it")
})

test("every json says which desprawl wrote it, and what it is", () => {
  const held = said<{ desprawl: string; repo: string }>("modules", ".", "--json")
  assert.equal(held.kind, "modules", "the envelope names the view it came from")
  assert.match(held.desprawl, /^\d+\.\d+\.\d+$/, "and the version that wrote it")
  assert.ok(held.repo.startsWith("/"), "and the repo it read, as one path however it was typed")

  // and the payloads that can be written to a file carry it themselves
  const graph = build(".")
  assert.equal(graph.desprawl, VERSION)
  assert.ok(graph.repo.endsWith("desprawl"), "a graph knows where it came from")
  const rang = calls(".", graph)
  assert.equal(rang.desprawl, VERSION, "so does a call graph")
  const layout = fold(graph, balanced(graph))
  assert.equal(
    knowledge(".", { graph, layout, calls: rang, grain: "module" }).desprawl,
    VERSION,
    "and the knowledge graph, which is the one built for other tools",
  )
})

test("--anon leaves every address out, whichever way the numbers come out", () => {
  const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/
  const plain = said<{
    repo: string
    contributors: { email: string; also?: string[] }[]
    identities: { email: string }[]
  }>("cli", ".", "--json").data
  assert.ok(
    plain.identities.some((one) => one.email),
    "the plain read has the addresses",
  )

  const held = run("cli", ".", "--json", "--anon").out
  assert.doesNotMatch(held, ADDRESS, "and --anon has none of them, folded ones included")
  const hidden = (JSON.parse(held) as { data: typeof plain }).data
  assert.equal(hidden.contributors.length, plain.contributors.length, "the people are still there")
  assert.ok(!hidden.repo.includes("/"), "and the path is the folder, not this machine")

  // the panels print their own shapes, and history carries the people
  const past = run("history", ".", "--json", "--anon").out
  assert.doesNotMatch(past, ADDRESS, "a view payload is anonymous too")

  // a remote names the account this is hosted under, and an ssh one is an address
  assert.ok(
    said<{ remotes: unknown[] }>("cli", ".", "--json").data.remotes.length,
    "the plain read has them",
  )
  assert.deepEqual(hidden.remotes, [], "and --anon has none")
  assert.doesNotMatch(held, /github\.com\//, "nor the url anywhere else in the payload")
})

test("what a forge wrote is scrubbed, what a person wrote is not", () => {
  const said = (subject: string) =>
    anonymous({
      repo: "/home/someone/repo",
      contributors: [],
      identities: [],
      remotes: [],
      log: [{ subject }],
    } as unknown as Stats).log[0].subject

  assert.equal(said("Merge pull request #400 from acme/jane/feat-thing"), "Merge pull request #400")
  assert.equal(
    said("Merge branch 'dev' of github.com:acme/app into jane/feat-thing"),
    "Merge branch 'dev'",
  )
  assert.equal(said("see https://acme.example/docs for why"), "see for why", "a url goes")
  assert.equal(
    said("fix model.ts:12, thanks acme"),
    "fix model.ts:12, thanks acme",
    "and prose is left as it was written",
  )
})
