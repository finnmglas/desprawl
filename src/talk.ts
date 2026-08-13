// owner: finn
// goal: an agent run you can watch and answer, rather than a wall of output

import { begin, stop, type Alive } from "./actions.ts"
import { plan } from "./agent.ts"

export interface Turn {
  /** the person, the agent, or a tool the agent reached for */
  who: "you" | "agent" | "tool" | "note"
  text: string
  /** what the tool was called, when this is one */
  tool?: string
  at: number
}

export interface Talk {
  /** the task, and the action id watching it */
  id: string
  task: string
  tool: string
  model: string
  mode: string
  since: number
  /** when it stopped, since a clock that keeps going says it is still working */
  until: number
  running: boolean
  code: number | null
  /** what the cli calls this conversation */
  session: string
  /** only a cli that resumes can be answered */
  answerable: boolean
  turns: Turn[]
  /** what it cost, when the cli says */
  cost: number
  /** what it printed that was not json */
  raw: string
}

const going = new Map<string, Talk>()

/** nothing is dropped on its own: what it did is worth more after it stops */
export const talks = (): Talk[] => [...going.values()].sort((a, b) => b.since - a.since)

/** a second go is its own conversation, never a write over the first */
const free = (id: string): string => {
  if (!going.has(id)) return id
  for (let n = 2; ; n++) if (!going.has(`${id} #${n}`)) return `${id} #${n}`
}

/** only ever by asking, and never while it is still working */
export function close(id: string): { closed: boolean; why?: string } {
  const talk = going.get(id)
  if (!talk) return { closed: false, why: "there is nothing here by that name" }
  if (talk.running) return { closed: false, why: "it is still working, so stop it first" }
  going.delete(id)
  return { closed: true }
}

/** the one field worth reading in a list */
const about = (input: Record<string, any> = {}): string => {
  const first =
    input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url ?? input.prompt
  const said = typeof first === "string" ? first : JSON.stringify(input)
  return said.length > 120 ? `${said.slice(0, 120)}…` : said
}

const add = (talk: Talk, turn: Omit<Turn, "at">) => {
  const last = talk.turns.at(-1)
  // a paragraph arrives in pieces, and a transcript of pieces is unreadable
  if (last && last.who === turn.who && !turn.tool && !last.tool && turn.who === "agent")
    last.text += turn.text
  else talk.turns.push({ ...turn, at: Date.now() })
}

/** one json object per line, and whatever is not one is kept as it came */
function swallow(talk: Talk, line: string) {
  if (!line.trim()) return
  let said: Record<string, any>
  try {
    said = JSON.parse(line) as Record<string, any>
  } catch {
    talk.raw = `${talk.raw}${line}\n`.slice(-8000)
    if (!talk.answerable) add(talk, { who: "agent", text: `${line}\n` })
    return
  }
  if (said.type === "system" && said.subtype === "init") talk.session = said.session_id ?? ""
  else if (said.type === "assistant")
    for (const part of (said.message?.content ?? []) as Record<string, any>[]) {
      if (part.type === "text" && part.text?.trim()) add(talk, { who: "agent", text: part.text })
      if (part.type === "tool_use")
        add(talk, { who: "tool", tool: part.name, text: about(part.input) })
    }
  else if (said.type === "user") {
    // noise until it fails, and then the whole story
    for (const part of (said.message?.content ?? []) as Record<string, any>[])
      if (part.type === "tool_result" && part.is_error)
        add(talk, { who: "note", text: `that failed: ${String(part.content).slice(0, 200)}` })
  } else if (said.type === "result") {
    talk.cost += Number(said.total_cost_usd ?? 0)
    if (said.is_error && said.result) add(talk, { who: "note", text: String(said.result) })
  }
}

/** whole lines only: a chunk lands mid object often enough to matter */
const feed = (talk: Talk, chunk: string, rest: { left: string }) => {
  const parts = (rest.left + chunk).split("\n")
  rest.left = parts.pop() ?? ""
  for (const line of parts) swallow(talk, line)
}

const run = (repo: string, talk: Talk, prompt: string, install: string, trust: string): Alive => {
  const sent = plan(repo, prompt, talk.model, talk.mode, install, trust, talk.session)
  talk.answerable = sent.streams
  talk.running = true
  talk.code = null
  talk.since = Date.now()
  talk.until = 0
  const rest = { left: "" }
  return begin(repo, talk.id, sent.argv, sent.env, (chunk, done) => {
    if (chunk) return feed(talk, chunk, rest)
    if (rest.left) swallow(talk, rest.left)
    rest.left = ""
    talk.running = false
    talk.until = Date.now()
    talk.code = done
  })
}

/** a transcript out of raw chunks */
export function read(...chunks: string[]): Talk {
  const talk = blank("read", "", "", "")
  talk.answerable = true
  const rest = { left: "" }
  for (const chunk of chunks) feed(talk, chunk, rest)
  if (rest.left) swallow(talk, rest.left)
  return talk
}

/** hand one task over, and keep everything said about it */
const blank = (id: string, task: string, model: string, mode: string): Talk => ({
  id,
  task,
  tool: "",
  model,
  mode,
  since: Date.now(),
  until: 0,
  running: false,
  code: null,
  session: "",
  answerable: false,
  turns: task ? [{ who: "you", text: task, at: Date.now() }] : [],
  cost: 0,
  raw: "",
})

export function startTalk(
  repo: string,
  id: string,
  task: string,
  prompt: string,
  model: string,
  mode: string,
  install = "",
  trust = "auto",
): Talk {
  const talk = blank(free(`fix:${id}`), task, model, mode)
  const sent = plan(repo, prompt, model, mode, install, trust)
  talk.tool = sent.tool
  going.set(talk.id, talk)
  run(repo, talk, prompt, install, trust)
  return talk
}

/** the same conversation, one more thing said into it */
export function say(repo: string, id: string, text: string, install = "", trust = "auto"): Talk {
  const talk = going.get(id)
  if (!talk) throw new Error(`nothing here is working on ${id}`)
  if (talk.running) throw new Error("it is still working, so it is not listening yet")
  if (!talk.answerable || !talk.session) throw new Error(`${talk.tool} cannot be answered here`)
  add(talk, { who: "you", text })
  run(repo, talk, text, install, trust)
  return talk
}

/** said in the transcript, not only in the exit code */
export function hush(id: string): boolean {
  const talk = going.get(id)
  if (talk?.running) {
    add(talk, { who: "note", text: "stopped by you" })
    talk.until = Date.now()
  }
  return stop(id)
}
