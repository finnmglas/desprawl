// owner: finn
// goal: the endpoints that start something, and the ones that stop it

import type { IncomingMessage } from "node:http"
import { act, actions, alive, begin, forget, stop as stopAction } from "./actions.ts"
import { agent, ask } from "./agent.ts"
import { close, hush, say, startTalk, talks } from "./talk.ts"
import { run as runTests, tests } from "../facts/tests.ts"
import type { Holds } from "./holds.ts"

export interface Doing {
  url: URL
  req: IncomingMessage
  kept: Holds
  held: string[]
  at: (url: URL) => string
  repo: string
  json: (data: unknown, code?: number) => void
  send: (code: number, body: string, type: string) => void
}

/** true when one of them took it, so the caller knows to stop looking */
export function does(one: Doing): boolean {
  const { url, req, kept, held, at, repo } = one
  const json = (data: unknown, code = 200) => {
    one.json(data, code)
    return true
  }
  const send = (code: number, body: string, type: string) => {
    one.send(code, body, type)
    return true
  }
  /** a posted body, capped: a prompt is text, never a stream */
  const posted = (most: string, then: (said: Record<string, string>) => void) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
      if (body.length > 64_000) {
        send(413, most, "text/plain")
        req.destroy()
      }
    })
    req.on("end", () => {
      try {
        then(JSON.parse(body) as Record<string, string>)
      } catch (err) {
        json({ error: (err as Error).message }, 400)
      }
    })
    return true
  }

  if (url.pathname === "/api/tests") return json(kept.tests(url.searchParams.get("repo")))

  if (url.pathname === "/api/actions") return json(actions(at(url) || held[0]))

  // whether the button is worth offering
  if (url.pathname === "/api/agent") return json(agent(at(url) || held[0]))

  // text, and one argument, never a command
  if (url.pathname === "/api/agent/fix" && req.method === "POST")
    return posted("a prompt is smaller than this", (said) => {
      const prompt = ask(
        said.task ?? "",
        said.why ?? "",
        said.where ?? "",
        said.extra ?? "",
        said.mode ?? "",
        said.id ?? "task",
        // typed by hand, so it may be a question
        (said.id ?? "").startsWith("asked:"),
      )
      json(
        startTalk(
          repo,
          said.id ?? "task",
          said.task ?? "",
          prompt,
          said.model ?? "",
          said.mode ?? "",
          said.install ?? "",
          said.trust ?? "auto",
        ),
      )
    })

  if (url.pathname === "/api/agent/talks") return json(talks())

  // refused while it works: closing throws it away
  if (url.pathname === "/api/agent/close") return json(close(url.searchParams.get("id") ?? ""))

  if (url.pathname === "/api/agent/say" && req.method === "POST")
    return posted("a message is smaller than this", (said) => {
      json(say(repo, said.id ?? "", said.text ?? "", said.install ?? "", said.trust))
    })

  // started and left up, asked about or stopped from one panel
  if (url.pathname === "/api/actions/start") {
    try {
      return json(begin(repo, url.searchParams.get("id") ?? ""))
    } catch (err) {
      return json({ error: (err as Error).message }, 400)
    }
  }
  if (url.pathname === "/api/actions/stop" && url.searchParams.get("id")?.startsWith("fix:"))
    return json({ stopped: hush(url.searchParams.get("id") ?? "") })

  if (url.pathname === "/api/actions/stop") {
    return json({ stopped: stopAction(url.searchParams.get("id") ?? "") })
  }
  // an agent is watched like anything long, but not listed beside pnpm dev
  if (url.pathname === "/api/actions/forget")
    return json({ forgotten: forget(url.searchParams.get("id") ?? "") })

  if (url.pathname === "/api/actions/alive")
    return json(alive().filter((one) => !one.id.startsWith("fix:")))

  // by id: the command itself is never taken from the url
  if (url.pathname === "/api/actions/run") {
    act(repo, url.searchParams.get("id") ?? "").then(
      (ran) => json(ran),
      (err: Error) => json({ error: err.message }, 400),
    )
    return true
  }

  // the one thing here that can take minutes, so it happens only when asked
  if (url.pathname === "/api/tests/run") {
    const script = url.searchParams.get("script") ?? ""
    if (!/^[\w:-]+$/.test(script)) return json({ error: "bad script" }, 400)
    // never a command from the url: only the one this repo's own detection wrote
    const measuring = url.searchParams.has("coverage")
    const found = kept.tests()
    runTests(
      repo,
      measuring && found.measure ? found.measure : script,
      measuring && !found.measure ? found.measured : "",
    ).then(
      (ran) => json(kept.ran({ ...tests(repo), ran })),
      (err: Error) => json({ error: err.message }, 500),
    )
    return true
  }

  return false
}
