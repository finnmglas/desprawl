// owner: finn
// goal: a stream of json becomes something a person can read

import assert from "node:assert/strict"
import test from "node:test"
import { close, read } from "../src/talk.ts"

const stream = [
  `{"type":"system","subtype":"init","session_id":"abc-123","model":"claude-opus-5"}`,
  `{"type":"assistant","message":{"content":[{"type":"text","text":"Looking at "},{"type":"text","text":"the imports."}]}}`,
  `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"src/deps.ts"}}]}}`,
  `{"type":"user","message":{"content":[{"type":"tool_result","is_error":true,"content":"no such file"}]}}`,
  `{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.0123}`,
]

test("a run says which conversation it is, what it did and what it cost", () => {
  const talk = read(stream.join("\n"))
  assert.equal(talk.session, "abc-123", "the session is what lets it be answered later")
  assert.equal(talk.cost, 0.0123, "the cost is read off the result, not guessed")
  assert.deepEqual(
    talk.turns.map((one) => `${one.who}${one.tool ? ` ${one.tool}` : ""}`),
    ["agent", "tool Read", "note"],
    "text runs together, a tool is its own line, a failure is called out",
  )
  assert.equal(talk.turns[0].text, "Looking at the imports.", "a paragraph in pieces is one turn")
  assert.match(talk.turns[1].text, /src\/deps\.ts/, "a tool line says what it was pointed at")
})

test("a chunk that stops mid object waits for the rest of it", () => {
  const whole = stream.join("\n")
  const talk = read(whole.slice(0, 120), whole.slice(120))
  assert.equal(talk.session, "abc-123")
  assert.equal(talk.cost, 0.0123)
})

test("output that is not json at all is kept rather than dropped", () => {
  const talk = read("bash: claude: command not found\n")
  assert.match(talk.raw, /command not found/)
})

test("a run is kept until it is asked to go, and never while it is working", () => {
  assert.deepEqual(close("nothing by that name"), {
    closed: false,
    why: "there is nothing here by that name",
  })
})
