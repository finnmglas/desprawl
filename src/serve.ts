// owner: finn
// goal: live stats over localhost, ui attached

import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import type { ServerResponse } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { analyze } from "./analyze.ts"
import { calls } from "./calls.ts"
import type { Calls } from "./calls.ts"
import { build } from "./graph.ts"
import { deps } from "./deps.ts"
import { run as runTests, tests } from "./tests.ts"
import { act, actions, alive, begin, stop as stopAction } from "./actions.ts"
import type { Suite } from "./tests.ts"
import type { Deps } from "./deps.ts"
import type { Graph } from "./graph.ts"
import { bytesAt, count, detail, moved, page, timeline } from "./history.ts"
import type { Timeline } from "./history.ts"
import type { Node, Stats } from "./model.ts"
import { git } from "./model.ts"
import { explain } from "./needs.ts"
import { browser, print } from "./print.ts"
import { page as onePage, shell } from "./view.ts"

const HOST = "127.0.0.1"

// long enough for a reload to reconnect, short enough that closing the tab ends the command
const GRACE = 2_000

// fixed port, one origin, so the browser keeps its storage
const PORT = 7423

// where each platform keeps small config of its own
const config =
  process.platform === "win32"
    ? (process.env.APPDATA ?? homedir())
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config")

const store = join(config, "desprawl", "prefs.json")

const readPrefs = (): string => {
  try {
    const text = readFileSync(store, "utf8")
    JSON.parse(text) // catch corruptions
    return text
  } catch {
    return "{}"
  }
}

const writePrefs = (body: string): void => {
  mkdirSync(dirname(store), { recursive: true })
  writeFileSync(store, body)
}

// directories only, the leaves are 20 MB of a linux kernel
function prune(node: Node): Node {
  if (!node.children) return node
  const dirs = node.children.filter((c) => c.children)
  return {
    ...node,
    leaves: node.children.length - dirs.length,
    children: dirs.map(prune),
  }
}

const find = (node: Node, path: string[]): Node | undefined =>
  path.reduce<Node | undefined>((at, part) => at?.children?.find((c) => c.name === part), node)

export function serve(
  repo: string,
  cap?: number,
  keep = false,
  port = PORT,
  viewer?: string,
): Promise<string> {
  const tabs = new Set<ServerResponse>()
  let farewell: NodeJS.Timeout | undefined

  // hold it until the head moves or a refresh asks
  let cache: { head: string; stats: Stats } | null = null
  let total = 0
  let allTime: Timeline | null = null
  let sizes: { date: string; bytes: number }[] | null = null
  let imports: Graph | null = null
  let called: Calls | null = null
  let known: Deps | null = null
  let suite: Suite | null = null

  const load = (fresh: boolean): Stats => {
    const head = git(repo, "rev-parse", "--short", "HEAD").trim()
    if (!fresh && cache?.head === head) return cache.stats
    cache = { head, stats: analyze(repo, cap) }
    return cache.stats
  }
  // every page in the browser can reach localhost, so the port alone is not a secret
  const token = randomBytes(16).toString("hex")
  // the api answers without a built viewer, only the page itself needs one
  const html =
    viewer ??
    (() => {
      try {
        return shell()
      } catch {
        return ""
      }
    })()

  // stopping on purpose deserves the same sentence as stopping because a tab went
  process.once("SIGINT", () => {
    console.log("\n\nStopped by you, so desprawl is no longer serving that repo.\n")
    process.exit(0)
  })

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${HOST}`)
      const origin = req.headers.origin
      const allowed = `http://${HOST}:${(server.address() as { port: number }).port}`

      const send = (code: number, body: string, type: string) => {
        res.writeHead(code, {
          "content-type": type,
          "cache-control": "no-store",
          // the url holds the token, and referer would hand it to github
          "referrer-policy": "no-referrer",
        })
        res.end(body)
      }

      // a cross site page may not read this, even knowing the port
      if (origin && origin !== allowed) return send(403, "bad origin", "text/plain")
      if ((url.searchParams.get("t") ?? req.headers["x-desprawl-token"]) !== token) {
        return send(401, "bad token", "text/plain")
      }

      const json = (data: unknown, code = 200) =>
        send(code, JSON.stringify(data), "application/json")

      if (url.pathname === "/")
        return html
          ? send(200, html, "text/html")
          : send(500, "no viewer built, run: pnpm build", "text/plain")

      // the browser holds this open for as long as the tab lives
      if (url.pathname === "/api/session") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        })
        res.write(": open\n\n")
        tabs.add(res)
        clearTimeout(farewell)
        req.on("close", () => {
          tabs.delete(res)
          if (keep || tabs.size) return
          farewell = setTimeout(() => {
            console.log("\n\nTab closed, so desprawl stopped. Pass --keep to leave it running.\n")
            process.exit(0)
          }, GRACE)
        })
        return
      }

      // on disk, so a new port keeps them
      if (url.pathname === "/api/prefs") {
        if (req.method === "GET") return send(200, readPrefs(), "application/json")
        if (req.method === "PUT") {
          let body = ""
          // settings are small, catch it
          req.on("data", (chunk) => {
            body += chunk
            if (body.length > 64_000) {
              send(413, "settings are smaller than this", "text/plain")
              req.destroy()
            }
          })
          req.on("end", () => {
            try {
              JSON.parse(body) // never poison the next read
              writePrefs(body)
              send(200, body, "application/json")
            } catch {
              send(400, "bad json", "text/plain")
            }
          })
          return
        }
      }
      try {
        if (url.pathname === "/api/can-print") return json({ can: !!browser() })

        if (url.pathname === "/api/stats") {
          const stats = load(url.searchParams.has("fresh"))
          return json({ ...stats, tree: prune(stats.tree) })
        }

        if (url.pathname === "/api/files") {
          const at = url.searchParams.get("path") ?? ""
          const node = find(load(false).tree, at.split("/").filter(Boolean))
          // an empty list would read as an empty folder, which is a different thing
          if (!node) return json({ error: `no folder at ${at}` }, 404)
          const files = (node.children ?? []).filter((c) => !c.children)
          return json(files)
        }

        if (url.pathname === "/api/commit") {
          const hash = url.searchParams.get("hash") ?? ""
          if (!/^[0-9a-f]{4,40}$/i.test(hash)) return send(400, "bad hash", "text/plain")
          return json(detail(repo, hash))
        }

        // older commits, walked not read whole
        if (url.pathname === "/api/log") {
          const skip = Number(url.searchParams.get("skip")) || 0
          const take = Math.min(Number(url.searchParams.get("count")) || 200, 2000)
          const names = load(false).contributors.map((c) => (c.email || c.name).toLowerCase())
          return json(page(repo, skip, take, names))
        }

        // slow, so the ui asks after it has painted
        if (url.pathname === "/api/count") {
          total ||= count(repo)
          return json({ commits: total })
        }

        // measured at even points, not accumulated
        if (url.pathname === "/api/size") {
          allTime ||= timeline(repo)
          sizes ||= allTime.samples.map((s) => ({ date: s.date, bytes: bytesAt(repo, s.hash) }))
          return json(sizes)
        }

        // seconds of work on a big repo, so only on ask
        if (url.pathname === "/api/graph") {
          imports ||= build(repo)
          return json(imports)
        }

        // slower again than the import graph, since every body is read
        if (url.pathname === "/api/calls") {
          imports ||= build(repo)
          called ||= calls(repo, imports)
          return json(called)
        }

        // what moved between two dates, per file, for painting a window on the picture
        if (url.pathname === "/api/moved") {
          const from = url.searchParams.get("from") ?? ""
          const to = url.searchParams.get("to") ?? ""
          if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
            return send(400, "bad dates", "text/plain")
          const names = load(false).contributors.map((c) => (c.email || c.name).toLowerCase())
          return json(moved(repo, from, to, names))
        }

        // the whole thing as one file, using whatever this run has already built
        // printed by a real browser, so the text stays text
        if (url.pathname === "/api/pdf") {
          const port = (server.address() as { port: number }).port
          const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light"
          print(`http://${HOST}:${port}/?t=${token}&paper=1&theme=${theme}`).then(
            (made) => {
              res.writeHead(200, {
                "content-type": "application/pdf",
                "cache-control": "no-store",
              })
              res.end(made)
            },
            (err: Error) => json({ error: err.message }, 500),
          )
          return
        }

        if (url.pathname === "/api/tests") return json((suite ||= tests(repo)))

        if (url.pathname === "/api/actions") return json(actions(repo))

        // a server is started and left up, and asked about or stopped from the same panel
        if (url.pathname === "/api/actions/start") {
          try {
            return json(begin(repo, url.searchParams.get("id") ?? ""))
          } catch (err) {
            return json({ error: (err as Error).message }, 400)
          }
        }
        if (url.pathname === "/api/actions/stop") {
          return json({ stopped: stopAction(url.searchParams.get("id") ?? "") })
        }
        if (url.pathname === "/api/actions/alive") return json(alive())

        // by id: the command itself is never taken from the url
        if (url.pathname === "/api/actions/run") {
          act(repo, url.searchParams.get("id") ?? "").then(
            (ran) => json(ran),
            (err: Error) => json({ error: err.message }, 400),
          )
          return
        }

        // the one thing here that can take minutes, so it happens only when asked
        if (url.pathname === "/api/tests/run") {
          const script = url.searchParams.get("script") ?? ""
          if (!/^[\w:-]+$/.test(script)) return send(400, "bad script", "text/plain")
          // never a command from the url: only the one this repo's own detection wrote
          const measuring = url.searchParams.has("coverage")
          const found = (suite ||= tests(repo))
          runTests(
            repo,
            measuring && found.measure ? found.measure : script,
            measuring && !found.measure ? found.measured : "",
          ).then(
            (ran) => {
              suite = { ...(suite ||= tests(repo)), ...tests(repo), ran }
              json(suite)
            },
            (err: Error) => json({ error: err.message }, 500),
          )
          return
        }

        // read once a page asks, since it reaches the network
        if (url.pathname === "/api/deps") {
          ;(known ? Promise.resolve(known) : deps(repo).then((d) => (known = d))).then(
            (d) => json(d),
            (err: Error) => json({ error: err.message }, 500),
          )
          return
        }

        if (url.pathname === "/api/static") {
          imports ||= build(repo)
          const made = onePage(load(false), {
            graph: imports,
            called,
            deps: known,
            suite: (suite ||= tests(repo)),
            viewer: html,
          })
          return send(200, made.html, "text/html")
        }

        // dates and authors only, so the chart spans everything
        if (url.pathname === "/api/timeline") {
          allTime ||= timeline(repo)
          return json(allTime)
        }
      } catch (err) {
        const said = explain(err) ?? (err instanceof Error ? err.message.trim() : String(err))
        return json({ error: said }, 500)
      }
      return send(404, "not found", "text/plain")
    })

    // port taken, take any free one
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === PORT)
        serve(repo, cap, keep, 0, viewer).then(resolve, reject)
      else reject(err)
    })
    server.listen(port, HOST, () => {
      // the caller decides whether a browser opens, so a test can hold this url quietly
      resolve(`http://${HOST}:${(server.address() as { port: number }).port}/?t=${token}`)
    })
  })
}
