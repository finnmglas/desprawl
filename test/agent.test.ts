// owner: finn
// goal: what gets sent, and what is refused before anything is spawned

import assert from "node:assert/strict"
import { test } from "node:test"
import { agent, ask, fix, installs } from "../src/serve/agent.ts"
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

test("every cli here is offered with its own models, never with another one's", () => {
  const here = installs()
  if (!here.length) return assert.equal(agent(), null, "nothing installed is nothing offered")
  for (const one of here) {
    assert.ok(one.models.length, `${one.label} offers nothing to run`)
    assert.ok(one.bin, "and names the file it would run")
  }
  const claude = here.find((one) => one.tool === "claude")
  if (claude) assert.ok(claude.models.includes("opus"), "claude keeps its own aliases")
})

test("a model or a mode that was never offered is refused before anything runs", () => {
  const dir = repo({ "a.ts": "export const a = 1\n" })
  if (!installs().length)
    return assert.throws(() => fix(dir, "one", "do it", "opus", "plan"), /no agent cli/)
  assert.throws(() => fix(dir, "one", "do it", "gpt", "plan"), /no model called gpt/)
  assert.throws(() => fix(dir, "one", "do it", "opus", "rm -rf"), /no mode called/)
})

test("every cli offers its own leashes, and auto is never one of them", () => {
  for (const one of installs()) {
    assert.ok(one.trusts.length, `${one.label} offers no permission mode`)
    assert.ok(!one.trusts.includes("auto"), "auto is the absence of a choice, not a choice")
    // read off disk, so an unreadable one is empty rather than a guess
    assert.equal(typeof one.who, "string")
    if (one.who) assert.ok(one.label.endsWith(one.who), "the account is what tells them apart")
  }
})

test("a question typed by hand is answered, not turned into a change", () => {
  const asked = ask("how many files does the repo have?", "", ".", "", "local", "asked:x", true)
  assert.match(asked, /Answer this question/)
  assert.match(asked, /Change no file/, "the mode said commit, the question says do not")
  assert.doesNotMatch(asked, /branch called/, "and there is nothing to branch for")

  // the same box, an instruction rather than a question
  const told = ask("rename the weight helper", "", ".", "", "local", "asked:y", true)
  assert.match(told, /do the following task/)
  assert.match(told, /branch called/)

  // a found task is not read for question words: "Delete X" is work whatever it starts with
  const found = ask("Do not ship this file", "nothing reaches it", "a.ts", "", "unstaged")
  assert.match(found, /do the following task/)
})

test("whatever it is asked, it is told how to say it back", () => {
  for (const said of [
    ask("what is here?", "", ".", "", "plan", "asked:x", true),
    ask("t", "w", "p", "", "unstaged"),
  ])
    assert.match(said, /short, direct, the outcome first/)
})
