// owner: finn
// goal: a button only offers what this clone can actually do

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { test } from "node:test"
import { actions } from "../src/actions.ts"
import { repo } from "./repo.ts"

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" })

const pushOf = (dir: string) => actions(dir).find((one) => one.id === "push")!

/** a clone of somebody else's: a remote, a branch tracking it, and nothing ever sent */
function theirs(owner: string, who = "Tester") {
  const dir = repo({ "a.ts": "export const a = 1\n" })
  // set here rather than left to the machine, or whoever runs the suite decides what it finds
  git(dir, "config", "user.name", who)
  git(dir, "config", "user.email", `${who.toLowerCase()}@example.com`)
  git(dir, "remote", "add", "origin", `https://github.com/${owner}/thing.git`)
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD")
  git(dir, "config", "branch.main.remote", "origin")
  git(dir, "config", "branch.main.merge", "refs/heads/main")
  return dir
}

test("nowhere to push to is the one case worth refusing outright", () => {
  const alone = repo({ "a.ts": "export const a = 1\n" })
  assert.match(pushOf(alone).blocked ?? "", /no remote/)
})

test("a branch tracking nothing is refused too, since plain git push cannot invent one", () => {
  const dir = repo({ "a.ts": "export const a = 1\n" })
  git(dir, "remote", "add", "origin", "https://github.com/someone/thing.git")
  assert.match(pushOf(dir).blocked ?? "", /tracks nothing/)
})

test("somebody else's repo is doubted rather than refused, since only the remote knows", () => {
  const said = pushOf(theirs("someone-else"))
  assert.equal(said.blocked, undefined, "nothing here proves it would fail")
  assert.match(said.caution ?? "", /someone-else/, "and it names whose repo it is")
})

test("a short owner name is not a match just because the letters appear in a name", () => {
  // "finn" holds an i and an n: matching on letters would wave through anybody's repo
  const said = pushOf(theirs("i", "Finn"))
  assert.match(said.caution ?? "", /is not a name on its commits/, "one letter proves nothing")
})

test("a remote named after the person committing is taken at its word", () => {
  const said = pushOf(theirs("tester"))
  assert.equal(said.blocked, undefined)
  assert.equal(said.caution, undefined, "the owner is a name on its own commits")
})
