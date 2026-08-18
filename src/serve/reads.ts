// owner: finn
// goal: the endpoints that only read, answered from what the run holds

import { detail, moved, page } from "../facts/history.ts"
import { hourly } from "../facts/samples.ts"
import { browser } from "./print.ts"
import { page as onePage } from "./view.ts"
import { git, type Node } from "../read/model.ts"
import type { Holds } from "./holds.ts"
import { closeSync, lstatSync, openSync, readSync } from "node:fs"
import { join } from "node:path"

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

// enough to read a file by, and a minified bundle never reaches the tab whole
const MOST = 512_000

export interface Source {
  text: string
  bytes: number
  /** cut at a line, so the end is not half a character */
  clipped: boolean
  binary: boolean
}

/** one tracked file, read for looking at */
function source(repo: string, at: string): Source | null {
  // git decides what is inside the repo, so ../etc/passwd never gets this far
  try {
    git(repo, "ls-files", "--error-unmatch", "--", at)
  } catch {
    return null
  }
  const full = join(repo, at)
  // lstat, or a tracked symlink would be followed straight out of the repo
  const stat = lstatSync(full)
  if (!stat.isFile()) return null

  const fd = openSync(full, "r")
  try {
    const buf = Buffer.alloc(Math.min(stat.size, MOST))
    const seen = buf.subarray(0, readSync(fd, buf, 0, buf.length, 0))
    if (seen.includes(0)) return { text: "", bytes: stat.size, clipped: false, binary: true }
    const text = seen.toString("utf8")
    const clipped = stat.size > seen.length
    // a minified bundle is one line, and cutting that at a newline would show nothing
    const line = text.lastIndexOf("\n")
    return {
      text: clipped && line > 0 ? text.slice(0, line + 1) : text,
      bytes: stat.size,
      clipped,
      binary: false,
    }
  } finally {
    closeSync(fd)
  }
}

export interface Asked {
  url: URL
  /** every reader this run answers with */
  kept: Holds
  held: string[]
  /** the repo a request is about */
  at: (url: URL) => string
  repo: string
  html: string
  json: (data: unknown, code?: number) => void
  send: (code: number, body: string, type: string) => void
}

/** true when one of them answered, so the caller knows to stop looking */
export function reads(one: Asked): boolean {
  const { url, kept, held, at, repo, html } = one
  const json = (data: unknown, code = 200) => {
    one.json(data, code)
    return true
  }
  const send = (code: number, body: string, type: string) => {
    one.send(code, body, type)
    return true
  }

  if (url.pathname === "/api/can-print") return json({ can: !!browser() })

  // the repos in this folder, and which one a request is about
  if (url.pathname === "/api/repos")
    return json(held.map((one) => one.split("/").filter(Boolean).pop()))

  if (url.pathname === "/api/stats") {
    const stats = kept.stats(url.searchParams.has("fresh"), url.searchParams.get("repo"))
    return json({ ...stats, tree: prune(stats.tree) })
  }

  if (url.pathname === "/api/files") {
    const asked = url.searchParams.get("path") ?? ""
    const tree = kept.stats(false, url.searchParams.get("repo")).tree
    const node = find(tree, asked.split("/").filter(Boolean))
    // an empty list would read as an empty folder, which is a different thing
    if (!node) return json({ error: `no folder at ${asked}` }, 404)
    const files = (node.children ?? []).filter((c) => !c.children)
    return json(files)
  }

  // the contents behind a row, which only a served run has to hand
  if (url.pathname === "/api/source") {
    const asked = url.searchParams.get("path") ?? ""
    const found = source(at(url), asked)
    if (!found) return json({ error: `no file this repo tracks at ${asked}` }, 404)
    return json(found)
  }

  if (url.pathname === "/api/commit") {
    const hash = url.searchParams.get("hash") ?? ""
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) return send(400, "bad hash", "text/plain")
    return json(detail(at(url), hash))
  }

  // older commits, walked not read whole
  if (url.pathname === "/api/log") {
    const skip = Number(url.searchParams.get("skip")) || 0
    const take = Math.min(Number(url.searchParams.get("count")) || 200, 2000)
    const names = kept.stats(false).contributors.map((c) => (c.email || c.name).toLowerCase())
    return json(page(at(url), skip, take, names))
  }

  // slow, so the ui asks after it has painted
  if (url.pathname === "/api/count") return json({ commits: kept.commits() })

  // measured at even points, not accumulated
  if (url.pathname === "/api/size") return json(kept.sizes())

  // seconds of work on a big repo, so only on ask
  if (url.pathname === "/api/graph") return json(kept.graph(at(url)))

  // slower again than the import graph, since every body is read
  if (url.pathname === "/api/calls") return json(kept.calls(at(url)))

  // which file serves an endpoint and which one calls it, across the whole folder
  if (url.pathname === "/api/routes") return json(kept.api(at(url)))

  // what moved between two dates, per file, for painting a window on the picture
  if (url.pathname === "/api/moved") {
    const from = url.searchParams.get("from") ?? ""
    const to = url.searchParams.get("to") ?? ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return send(400, "bad dates", "text/plain")
    const names = kept.stats(false).contributors.map((c) => (c.email || c.name).toLowerCase())
    return json(moved(at(url) || held[0], from, to, names))
  }
  if (url.pathname === "/api/sprawl") return json(kept.sprawl())

  if (url.pathname === "/api/deps") {
    kept.deps().then(
      (one) => json(one),
      (err: Error) => json({ error: err.message }, 500),
    )
    return true
  }

  if (url.pathname === "/api/static") {
    const made = onePage(kept.stats(false), {
      root: at(url) || repo,
      graph: kept.graph(at(url)),
      called: kept.read.calls,
      deps: kept.read.deps,
      suite: kept.tests(),
      viewer: html,
    })
    return send(200, made.html, "text/html")
  }

  // dates and authors only, so the chart spans everything
  // too fine for the payload
  if (url.pathname === "/api/hours") {
    const from = url.searchParams.get("from") ?? ""
    const to = url.searchParams.get("to") ?? ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return send(400, "bad dates", "text/plain")
    return json(hourly(repo, from, to))
  }

  if (url.pathname === "/api/timeline") return json(kept.timeline())
  return false
}
