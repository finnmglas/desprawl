// owner: finn
// goal: live stats over localhost, ui attached

import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { analyze } from "./analyze.ts"
import { open, shell } from "./view.ts"

const HOST = "127.0.0.1"

// fixed port, one origin, so the browser keeps its storage
const PORT = 7423

const store = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "desprawl",
  "prefs.json",
)

const readPrefs = (): string => {
  try {
    return readFileSync(store, "utf8")
  } catch {
    return "{}"
  }
}

const writePrefs = (body: string): void => {
  mkdirSync(dirname(store), { recursive: true })
  writeFileSync(store, body)
}

export function serve(repo: string, port = PORT): Promise<string> {
  // every page in the browser can reach localhost, so the port alone is not a secret
  const token = randomBytes(16).toString("hex")
  const html = shell()

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${HOST}`)
      const origin = req.headers.origin
      const allowed = `http://${HOST}:${(server.address() as { port: number }).port}`

      const send = (code: number, body: string, type: string) => {
        res.writeHead(code, { "content-type": type, "cache-control": "no-store" })
        res.end(body)
      }

      // a cross site page may not read this, even knowing the port
      if (origin && origin !== allowed) return send(403, "bad origin", "text/plain")
      if ((url.searchParams.get("t") ?? req.headers["x-desprawl-token"]) !== token) {
        return send(401, "bad token", "text/plain")
      }

      if (url.pathname === "/") return send(200, html, "text/html")

      // on disk, so a new port keeps them
      if (url.pathname === "/api/prefs") {
        if (req.method === "GET") return send(200, readPrefs(), "application/json")
        if (req.method === "PUT") {
          let body = ""
          req.on("data", (chunk) => (body += chunk))
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
      if (url.pathname === "/api/stats") {
        try {
          return send(200, JSON.stringify(analyze(repo)), "application/json")
        } catch (err) {
          return send(500, JSON.stringify({ error: String(err) }), "application/json")
        }
      }
      return send(404, "not found", "text/plain")
    })

    // port taken, take any free one
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === PORT) serve(repo, 0).then(resolve, reject)
      else reject(err)
    })
    server.listen(port, HOST, () => {
      const live = `http://${HOST}:${(server.address() as { port: number }).port}/?t=${token}`
      open(live)
      resolve(live)
    })
  })
}
