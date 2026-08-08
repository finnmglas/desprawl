// owner: finn
// goal: live stats over localhost, ui attached

import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { analyze } from "./analyze.ts"
import { open, shell } from "./view.ts"

const HOST = "127.0.0.1"

export function serve(repo: string, port = 0): Promise<string> {
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
      if (url.pathname === "/api/stats") {
        try {
          return send(200, JSON.stringify(analyze(repo)), "application/json")
        } catch (err) {
          return send(500, JSON.stringify({ error: String(err) }), "application/json")
        }
      }
      return send(404, "not found", "text/plain")
    })

    server.on("error", reject)
    server.listen(port, HOST, () => {
      const live = `http://${HOST}:${(server.address() as { port: number }).port}/?t=${token}`
      open(live)
      resolve(live)
    })
  })
}
