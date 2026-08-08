// owner: finn
// goal: live stats over localhost, ui attached

import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import type { ServerResponse } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { analyze } from "./analyze.ts"
import { bytesAt, count, detail, page, timeline } from "./history.ts"
import type { Timeline } from "./history.ts"
import type { Node, Stats } from "./model.ts"
import { git } from "./model.ts"
import { explain } from "./needs.ts"
import { shell } from "./view.ts"

const HOST = "127.0.0.1"

// long enough for a reload, a sleeping laptop or a network blip to reconnect,
// short enough that closing the tab feels like it ended the command
const GRACE = 15_000

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

export function serve(repo: string, cap?: number, keep = false, port = PORT): Promise<string> {
  // closing the last tab ends the run
  const tabs = new Set<ServerResponse>()
  let farewell: NodeJS.Timeout | undefined

  // hold it until the head moves or a refresh asks
  let cache: { head: string; stats: Stats } | null = null
  let total = 0
  let allTime: Timeline | null = null
  let sizes: { date: string; bytes: number }[] | null = null

  const load = (fresh: boolean): Stats => {
    const head = git(repo, "rev-parse", "--short", "HEAD").trim()
    if (!fresh && cache?.head === head) return cache.stats
    cache = { head, stats: analyze(repo, cap) }
    return cache.stats
  }
  // every page in the browser can reach localhost, so the port alone is not a secret
  const token = randomBytes(16).toString("hex")
  const html = shell()

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

      if (url.pathname === "/") return send(200, html, "text/html")

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
            console.log(
              "\n\nLast tab closed, so desprawl stopped. Pass --keep to leave it running.\n",
            )
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
        if (url.pathname === "/api/stats") {
          const stats = load(url.searchParams.has("fresh"))
          return send(
            200,
            JSON.stringify({ ...stats, tree: prune(stats.tree) }),
            "application/json",
          )
        }

        // one folder's files
        if (url.pathname === "/api/files") {
          const at = url.searchParams.get("path") ?? ""
          const node = find(load(false).tree, at.split("/").filter(Boolean))
          // an empty list would read as an empty folder, which is a different thing
          if (!node)
            return send(404, JSON.stringify({ error: `no folder at ${at}` }), "application/json")
          const files = (node.children ?? []).filter((c) => !c.children)
          return send(200, JSON.stringify(files), "application/json")
        }

        // one commit in full, asked for when a row is opened
        if (url.pathname === "/api/commit") {
          const hash = url.searchParams.get("hash") ?? ""
          if (!/^[0-9a-f]{4,40}$/i.test(hash)) return send(400, "bad hash", "text/plain")
          return send(200, JSON.stringify(detail(repo, hash)), "application/json")
        }

        // older commits, walked not read whole
        if (url.pathname === "/api/log") {
          const skip = Number(url.searchParams.get("skip")) || 0
          const take = Math.min(Number(url.searchParams.get("count")) || 200, 2000)
          const names = load(false).contributors.map((c) => (c.email || c.name).toLowerCase())
          return send(200, JSON.stringify(page(repo, skip, take, names)), "application/json")
        }

        // slow, so the ui asks after it has painted
        if (url.pathname === "/api/count") {
          total ||= count(repo)
          return send(200, JSON.stringify({ commits: total }), "application/json")
        }

        // measured at even points, not accumulated
        if (url.pathname === "/api/size") {
          allTime ||= timeline(repo)
          sizes ||= allTime.samples.map((s) => ({ date: s.date, bytes: bytesAt(repo, s.hash) }))
          return send(200, JSON.stringify(sizes), "application/json")
        }

        // dates and authors only, so the chart spans everything
        if (url.pathname === "/api/timeline") {
          allTime ||= timeline(repo)
          return send(200, JSON.stringify(allTime), "application/json")
        }
      } catch (err) {
        // words, because this lands in front of a person
        const said = explain(err) ?? (err instanceof Error ? err.message.trim() : String(err))
        return send(500, JSON.stringify({ error: said }), "application/json")
      }
      return send(404, "not found", "text/plain")
    })

    // port taken, take any free one
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === PORT)
        serve(repo, cap, keep, 0).then(resolve, reject)
      else reject(err)
    })
    server.listen(port, HOST, () => {
      // the caller decides whether a browser opens, so a test can hold this url quietly
      resolve(`http://${HOST}:${(server.address() as { port: number }).port}/?t=${token}`)
    })
  })
}
