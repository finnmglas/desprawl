// owner: finn
// goal: live stats over localhost, ui attached

import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import type { ServerResponse } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { holds } from "./holds.ts"
import { does } from "./doings.ts"
import { reads } from "./reads.ts"
import { alive } from "./actions.ts"
import { explain } from "../facts/needs.ts"
import { print } from "./print.ts"
import { shell } from "./view.ts"

const HOST = "127.0.0.1"

// long enough to reconnect, short enough that closing the tab ends it
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

// machine wide: an email owns one face everywhere
const mugs = join(config, "desprawl", "faces.json")

const readFaces = (): Record<string, string> => {
  try {
    return JSON.parse(readFileSync(mugs, "utf8")) as Record<string, string>
  } catch {
    return {}
  }
}

/** merged, never replaced */
const writeFaces = (found: Record<string, string>): Record<string, string> => {
  const all = { ...readFaces(), ...found }
  mkdirSync(dirname(mugs), { recursive: true })
  writeFileSync(mugs, JSON.stringify(all))
  return all
}

export function serve(
  repo: string,
  cap?: number,
  keep = false,
  port = PORT,
  viewer?: string,
  // the token is the barrier, not the port, and it survives a restart
  token = randomBytes(16).toString("hex"),
  anon = false,
): Promise<string> {
  const tabs = new Set<ServerResponse>()
  let farewell: NodeJS.Timeout | undefined
  // every reader this run answers with, each built the first time it is asked for
  const kept = holds(repo, cap, anon)
  const held = kept.fleet
  /** the repo a request is about: the one it named, or this run's single one */
  const at = (url: URL): string => kept.at(url.searchParams.get("repo"))

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

      const json = (data: unknown, code = 200) =>
        send(code, JSON.stringify(data), "application/json")
      // one shape for everything that went wrong, whichever guard it was
      const oops = (code: number, said: string) => json({ error: said }, code)

      // a cross site page may not read this, even knowing the port
      if (origin && origin !== allowed) return oops(403, "bad origin")
      if ((url.searchParams.get("t") ?? req.headers["x-desprawl-token"]) !== token) {
        return oops(401, "bad token")
      }

      if (url.pathname === "/")
        return html ? send(200, html, "text/html") : oops(500, "no viewer built, run: pnpm build")

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
          let waited = false
          const leave = () => {
            if (tabs.size) return
            const working = alive().filter((one) => one.running)
            if (working.length) {
              // said once, not six hundred times over a long run
              if (!waited)
                console.log(
                  `\nTab closed, but ${working.length} run${working.length === 1 ? " is" : "s are"} still going, so desprawl stayed up.\n`,
                )
              waited = true
              farewell = setTimeout(leave, GRACE)
              return
            }
            console.log("\n\nTab closed, so desprawl stopped. Pass --keep to leave it running.\n")
            process.exit(0)
          }
          farewell = setTimeout(leave, GRACE)
        })
        return
      }

      // on disk, so a new port keeps them
      // github allows sixty calls an hour
      if (url.pathname === "/api/faces") {
        if (req.method === "GET") return json(readFaces())
        if (req.method === "PUT") {
          let body = ""
          req.on("data", (chunk) => {
            body += chunk
            if (body.length > 256_000) {
              oops(413, "more faces than anyone has")
              req.destroy()
            }
          })
          req.on("end", () => {
            try {
              return json(writeFaces(JSON.parse(body) as Record<string, string>))
            } catch {
              return json(readFaces())
            }
          })
          return
        }
      }

      if (url.pathname === "/api/prefs") {
        if (req.method === "GET") return send(200, readPrefs(), "application/json")
        if (req.method === "PUT") {
          let body = ""
          // settings are small, catch it
          req.on("data", (chunk) => {
            body += chunk
            if (body.length > 64_000) {
              oops(413, "settings are smaller than this")
              req.destroy()
            }
          })
          req.on("end", () => {
            try {
              JSON.parse(body) // never poison the next read
            } catch {
              return oops(400, "bad json")
            }
            try {
              writePrefs(body)
              send(200, body, "application/json")
            } catch (err) {
              send(500, err instanceof Error ? err.message : "could not write", "text/plain")
            }
          })
          return
        }
      }
      try {
        // everything that only reads
        if (reads({ url, kept, held, at, repo, html, json, send })) return

        // the whole thing as one file, printed by a real browser
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

        // everything that starts or stops something
        if (does({ url, req, kept, held, at, repo, json, send })) return

        // read once a page asks, and silence is never cached
      } catch (err) {
        const said = explain(err) ?? (err instanceof Error ? err.message.trim() : String(err))
        return json({ error: said }, 500)
      }
      return oops(404, "not found")
    })

    // port taken, take any free one
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === PORT)
        serve(repo, cap, keep, 0, viewer, token, anon).then(resolve, reject)
      else reject(err)
    })
    server.listen(port, HOST, () => {
      // the caller decides whether a browser opens, so a test can hold this url quietly
      resolve(`http://${HOST}:${(server.address() as { port: number }).port}/?t=${token}`)
    })
  })
}
