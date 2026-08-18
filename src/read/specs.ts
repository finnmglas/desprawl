// owner: finn
// goal: the documents that list endpoints, read as endpoints

import { closeSync, openSync, readFileSync, readSync } from "node:fs"
import { join } from "node:path"
import { jsonc } from "./graph.ts"

export interface Endpoint {
  id: string
  file: string
  line: number
  /** GET, POST, ANY for a route taking any of them, WS for a socket */
  method: string
  /** as it is matched on: a leading slash, every parameter a star */
  path: string
  /** as it was written, before the prefixes and the parameters */
  raw: string
  /** the library that serves it */
  framework: string
  /** the file holding the code behind it, when the route only names it */
  handler?: string
}

export interface Client {
  id: string
  file: string
  line: number
  method: string
  path: string
  raw: string
  framework: string
  /** the host it names, when it names one */
  host: string
}

/** one call site reaching one endpoint, which is the edge drawn in red */
export interface Link {
  from: string
  to: string
  call: string
  endpoint: string
  method: string
  path: string
  /** the whole path matched, or only its tail under a base url the client held */
  how: "exact" | "tail"
}

export interface Api {
  endpoints: Endpoint[]
  clients: Client[]
  links: Link[]
  stats: {
    endpoints: number
    clients: number
    /** call sites that found an endpoint here */
    linked: number
    /** call sites that found none, so they leave for somewhere else */
    outside: number
    frameworks: string[]
  }
}

/** a path as it is matched on, and the host it named if it named one */
export function normal(raw: string): { path: string; host: string } {
  let text = raw.trim()
  let host = ""
  const url = URL.exec(text)
  if (url) {
    host = url[1]
    text = url[2] ?? "/"
  }
  // a regex route holds a question mark of its own, so the holes go before the query does
  text = text.replace(/\\\//g, "/").replace(HOLE, "*")
  text = text.split(/[?#]/)[0]
  text = text.replace(/[\^$\\]/g, "").replace(/\.[*+]/g, "*")
  const parts = text
    .split("/")
    .filter(Boolean)
    .map((one) => (one.includes("*") ? (/\*\*|\.\.\./.test(one) ? "**" : "*") : one))
  return { path: `/${parts.join("/")}`, host }
}

// what stands in for a value: :id, {id}, <int:id>, [id], $id, \(id), a hole, (?P<id>\d+)
export const HOLE =
  /\(\?P?<[^>]*>[^)]*\)|\\\([^)]*\)|\([^)]*\)|\$?\{[^{}]*\}|\$[A-Za-z_]\w*|<[^>/]*>|:[A-Za-z_]\w*|\[[^\]/]*\]|%[sdv]/g

export const URL = /^(?:(?:https?|wss?):)?\/\/([^/?#\s]+)(\/[^\s]*)?$/i

/** two prefixes and a path, joined without a doubled or a missing slash */
export const under = (...parts: string[]) =>
  `/${parts.flatMap((one) => one.split("/").filter(Boolean)).join("/")}`.replace(/\/+$/, "") || "/"

/** one verb, whatever the library called it */
export function verbOf(said: string): string {
  const word = said.replace(/^add_/, "").toUpperCase()
  if (["ROUTE", "URL", "REQUEST", "HANDLE", "HANDLEFUNC", "ALL", "ANY", "MATCH"].includes(word))
    return "ANY"
  if (word === "WEBSOCKET") return "WS"
  if (word === "DEL") return "DELETE"
  if (["FETCH", "$FETCH", "OFETCH", "USESWR", "USESWRMUTATION", "PRELOAD"].includes(word))
    return "ANY"
  if (word === "SENDBEACON") return "POST"
  return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|WS)$/.test(word) ? word : "ANY"
}

const VERBS = /^(get|post|put|patch|delete|head|options|trace)$/i

/** which document a file is, off its name and its first few hundred bytes */
function kind(path: string, head: string): string {
  const name = path.split("/").pop() ?? ""
  if (/\.postman_collection\.json$/i.test(name)) return "postman"
  if (/\.bru$/i.test(name)) return "bruno"
  if (/\.(http|rest)$/i.test(name)) return "rest"
  if (/\.proto$/i.test(name)) return "proto"
  // a function's http event is a route the cloud will serve
  if (/^(serverless|template)\.ya?ml$/i.test(name) && /^functions:|^Resources:/m.test(head))
    return "serverless"
  if (/\.(ya?ml|json)$/i.test(name)) {
    if (/(^|\/)(openapi|swagger)[.-]/i.test(name) || /^(openapi|swagger)\./i.test(name))
      return "openapi"
    // a spec is a spec wherever it was filed, and it says its version near the top
    if (/["']?(openapi|swagger)["']?\s*:\s*["']?[23]\.\d/.test(head)) return "openapi"
  }
  return ""
}

/** the path entries of an openapi document, whether it is written as json or as yaml */
function openapi(text: string): { path: string; method: string; line: number }[] {
  const found: { path: string; method: string; line: number }[] = []
  const lineOf = (index: number) => text.slice(0, index).split("\n").length
  if (/^\s*\{/.test(text)) {
    const doc = jsonc(text) as { paths?: Record<string, Record<string, unknown>> } | null
    for (const [path, item] of Object.entries(doc?.paths ?? {}))
      for (const verb of Object.keys(item ?? {}))
        if (VERBS.test(verb))
          found.push({
            path,
            method: verb.toUpperCase(),
            // the line the path is written on, since json holds no line numbers of its own
            line: lineOf(Math.max(0, text.indexOf(`"${path}"`))),
          })
    return found
  }
  // yaml: the paths block, its entries, and the verbs under each of them
  const lines = text.split("\n")
  let at = lines.findIndex((one) => /^paths:\s*$/.test(one))
  if (at === -1) return found
  let path = ""
  let deep = 0
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = /^\s*/.exec(line)![0].length
    if (indent === 0) break
    const named = /^\s*(["']?)(\/[^"':]*)\1\s*:/.exec(line)
    if (named && (!path || indent <= deep)) {
      path = named[2]
      deep = indent
      continue
    }
    const verb = /^\s*(["']?)([a-z]+)\1\s*:/.exec(line)
    if (path && verb && indent > deep && VERBS.test(verb[2]))
      found.push({ path, method: verb[2].toUpperCase(), line: i + 1 })
  }
  return found
}

/** the http events a serverless or sam template declares, each one a route */
function events(text: string): { path: string; method: string; line: number }[] {
  const found: { path: string; method: string; line: number }[] = []
  const lines = text.split("\n")
  let path = ""
  let at = 0
  for (const [i, line] of lines.entries()) {
    // the two write the same pair with a different case, and either order
    const said = /^\s*-?\s*(?:path|Path)\s*:\s*["']?([^"'#\s]+)/.exec(line)?.[1]
    if (said) {
      path = said
      at = i + 1
    }
    const verb = /^\s*(?:method|Method)\s*:\s*["']?(\w+)/.exec(line)?.[1]
    if (path && verb && i - at < 4) {
      found.push({ path, method: verb.toUpperCase(), line: at })
      path = ""
    }
  }
  return found
}

/** every request a collection file holds, whichever tool wrote it */
function asked(kind: string, text: string): { url: string; method: string; line: number }[] {
  const found: { url: string; method: string; line: number }[] = []
  const lineOf = (index: number) => text.slice(0, index).split("\n").length
  if (kind === "rest")
    for (const m of text.matchAll(
      /^(?:###[^\n]*\n)?\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/gm,
    ))
      found.push({ url: m[2], method: m[1], line: lineOf(m.index) })
  if (kind === "bruno") {
    const verb = /^\s*(get|post|put|patch|delete|head|options)\s*\{/m.exec(text)
    // an empty url line reads the next key as its value
    for (const m of text.matchAll(/^\s*url\s*:[^\S\n]*(\S*[/{][^\s]*)/gm))
      found.push({
        url: m[1],
        method: (verb?.[1] ?? "any").toUpperCase(),
        line: lineOf(m.index),
      })
  }
  if (kind === "postman") {
    const doc = jsonc(text) as Record<string, unknown> | null
    const walk = (item: unknown) => {
      if (Array.isArray(item)) return item.forEach(walk)
      const one = item as { item?: unknown; request?: { method?: string; url?: unknown } }
      if (one?.item) walk(one.item)
      const request = one?.request
      if (!request) return
      const url = request.url
      const raw =
        typeof url === "string"
          ? url
          : ((url as { raw?: string })?.raw ??
            ((url as { host?: string[]; path?: string[] })?.path ?? []).join("/"))
      if (raw) found.push({ url: raw, method: (request.method ?? "any").toUpperCase(), line: 1 })
    }
    walk(doc?.item)
  }
  return found
}

/** a grpc service is a path too: /package.Service/Method, and the wire is http/2 */
function grpc(text: string): { path: string; line: number }[] {
  const found: { path: string; line: number }[] = []
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(text)?.[1] ?? ""
  const lineOf = (index: number) => text.slice(0, index).split("\n").length
  for (const service of text.matchAll(/\bservice\s+(\w+)\s*\{([^}]*)\}/g))
    for (const rpc of service[2].matchAll(/\brpc\s+(\w+)/g))
      found.push({
        path: `/${[pkg, service[1]].filter(Boolean).join(".")}/${rpc[1]}`,
        line:
          lineOf(service.index) +
          text.slice(service.index).slice(0, rpc.index).split("\n").length -
          1,
      })
  return found
}

// enough of a document to tell what it is, and a lockfile is megabytes of it
const HEAD = 4096

/** the first few kilobytes, since most of what a repo tracks is not a document at all */
function head(path: string): string {
  let fd = -1
  try {
    fd = openSync(path, "r")
    const buf = Buffer.alloc(HEAD)
    return buf.subarray(0, readSync(fd, buf, 0, HEAD, 0)).toString("utf8")
  } catch {
    return ""
  } finally {
    if (fd !== -1) closeSync(fd)
  }
}

/** what the documents in a repo say it serves and calls */
export function specs(
  repo: string,
  tracked: string[],
): { endpoints: Endpoint[]; clients: Client[]; hosts: string[] } {
  const endpoints: Endpoint[] = []
  const clients: Client[] = []
  // a spec says where it is served, which is the one honest way to know a host is ours
  const hosts = new Set<string>()
  for (const path of tracked) {
    if (!/\.(ya?ml|json|bru|http|rest|proto)$/i.test(path)) continue
    const full = join(repo, path)
    const what = kind(path, head(full))
    if (!what) continue
    let text = ""
    try {
      text = readFileSync(full, "utf8")
    } catch {
      continue
    }
    if (what === "openapi") {
      for (const m of text.slice(0, HEAD).matchAll(/\burl["']?\s*:\s*["']?(https?:\/\/[^\s"',]+)/g))
        hosts.add(normal(m[1]).host.replace(/:\d+$/, ""))
      const named = /^\s*host["']?\s*:\s*["']?([\w.-]+)/m.exec(text.slice(0, HEAD))?.[1]
      if (named) hosts.add(named.replace(/:\d+$/, ""))
      // servers: https://host/api/v3 puts everything under that last part
      const base = /^\s*-?\s*url:\s*["']?(\S+?)["']?\s*$/m.exec(
        text.slice(text.search(/^servers:/m) === -1 ? 0 : text.search(/^servers:/m), HEAD),
      )?.[1]
      const root =
        /^\s*basePath:\s*["']?(\S+?)["']?\s*$/m.exec(text)?.[1] ??
        (base && /^servers:/m.test(text) ? normal(base).path.replace(/^\/$/, "") : "")
      for (const one of openapi(text)) {
        const held = under(root, normal(one.path).path)
        endpoints.push({
          id: `${path}:${one.line}:${one.method}:${held}`,
          file: path,
          line: one.line,
          method: one.method,
          path: held,
          raw: one.path,
          framework: "openapi",
        })
      }
      continue
    }
    if (what === "serverless") {
      for (const one of events(text)) {
        const held = normal(one.path).path
        if (held === "/") continue
        endpoints.push({
          id: `${path}:${one.line}:${one.method}:${held}`,
          file: path,
          line: one.line,
          method: one.method,
          path: held,
          raw: one.path,
          framework: "serverless",
        })
      }
      continue
    }
    if (what === "proto") {
      for (const one of grpc(text))
        endpoints.push({
          id: `${path}:${one.line}:POST:${one.path}`,
          file: path,
          line: one.line,
          method: "POST",
          path: one.path,
          raw: one.path,
          framework: "grpc",
        })
      continue
    }
    for (const one of asked(what, text)) {
      const { path: held, host } = normal(one.url)
      if (held === "/") continue
      clients.push({
        id: `${path}:${one.line}:${verbOf(one.method)}:${held}`,
        file: path,
        line: one.line,
        method: verbOf(one.method),
        path: held,
        raw: one.url,
        framework: what,
        host,
      })
    }
  }
  return { endpoints, clients, hosts: [...hosts].filter(Boolean) }
}
