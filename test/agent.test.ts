// owner: finn
// goal: what gets sent, and what is refused before anything is spawned

import assert from "node:assert/strict"
import { test } from "node:test"
import { ask, fix } from "../src/agent.ts"
import { repo } from "./repo.ts"

test("the prompt carries the task, why it was raised, and where to look", () => {
  const said = ask("Delete orphan", "nothing reaches it", "lib/one.ts", "")
  assert.match(said, /Delete orphan/)
  assert.match(said, /nothing reaches it/)
  assert.match(said, /lib\/one\.ts/)
  assert.match(said, /Do not stage, commit or push/, "unstaged is what it defaults to")
  assert.doesNotMatch(said, /Extra instructions/, "an empty note adds no line")
})

test("each way of finishing says plainly what it does with the work", () => {
  const plan = ask("t", "w", "p", "", "plan")
  assert.match(plan, /Change no file/)

  const local = ask("t", "w", "p", "", "local", "dead:lib.ts#orphan")
  assert.match(
    local,
    /branch called `desprawl\/dead-lib-ts-orphan`/,
    "its own branch, named after it",
  )
  assert.match(local, /Co-authored-by: Claude/, "whoever did the work goes on the commit")
  assert.match(local, /Co-authored-by: desprawl/)
  assert.match(local, /Do not push it/)

  const pr = ask("t", "w", "p", "", "pr", "dead:lib.ts#orphan")
  assert.match(pr, /gh pr create/)
  assert.doesNotMatch(pr, /Do not push it/, "the whole point of this one is that it goes")
})

test("what the person typed is passed on, and nothing of theirs is a command", () => {
  const said = ask("t", "w", "p", "  use the existing helper  ")
  assert.match(said, /Extra instructions from the person asking: use the existing helper/)
})

test("a model or a mode that was never offered is refused before anything runs", () => {
  const dir = repo({ "a.ts": "export const a = 1\n" })
  assert.throws(() => fix(dir, "one", "do it", "gpt", "plan"), /no model called gpt/)
  assert.throws(() => fix(dir, "one", "do it", "opus", "rm -rf"), /no mode called/)
})
