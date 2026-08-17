// owner: julia
// goal: which file serves an http endpoint, and which file calls one

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { candidates, dialectOf } from "./dialects.ts"
import { MARK, foreign, scrub, specifiers } from "./specifiers.ts"
import { build, type Graph } from "./graph.ts"
import { calls as callGraph, type Calls } from "./calls.ts"

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

// § is a string the scrub took out, its letter kept (python writes half its routes as r"")
// and ¶ is that or a name holding one, since fetch(url) is written as often
const marks = (src: string): RegExp =>
  new RegExp(
    src
      .replace(/¶/g, `(?:[rbuf]{0,2}${MARK}(?<p>\\d+)${MARK}|(?<v>[A-Za-z_$][\\w$.]*))`)
      .replace(/§(\w)?/g, (_, name: string | undefined) =>
        name ? `[rbuf]{0,2}${MARK}(?<${name}>\\d+)${MARK}` : `[rbuf]{0,2}${MARK}(\\d+)${MARK}`,
      ),
    "g",
  )

const VERBS = "get|post|put|patch|delete|head|options"

interface Rule {
  /** the library, or the shape when several share one */
  id: string
  langs: string[]
  /** server, client, or read off what stands around it */
  side: "server" | "client" | "guess"
  re: string
  /** when the pattern names no method */
  method?: string
  /** a route may name no path of its own, and take the one its class holds */
  bare?: boolean
  /** only where the rest of the object says a request, since a url alone is often a link */
  asked?: boolean
  /** an annotation a class can carry, where it is a prefix and not a route of its own */
  onClass?: boolean
  files?: RegExp
  /** how much of a path a rule loose enough to need it demands */
  strict?: "root" | "host"
  /** and the library the file, or something it includes, has to name */
  needs?: RegExp
}

// prettier-ignore
const RULES: Rule[] = [
  // ---- javascript and typescript ----
  // app.get("/x", handler) serves it, axios.get("/x") calls it, and the shape says which
  { id: "http", langs: ["ts"], side: "guess",
    re: String.raw`\b(?<who>[A-Za-z_$][\w$]*)\s*\.\s*(?<m>${VERBS}|all|del)\s*(?:<[^<>()]*>)?\s*\(\s*¶` },
  // router.route("/x").get(handler)
  { id: "express", langs: ["ts"], side: "server",
    re: String.raw`\.route\s*\(\s*§p\s*\)\s*\.\s*(?<m>${VERBS}|all)` },
  { id: "nest", langs: ["ts"], side: "server", bare: true,
    re: String.raw`@(?<m>Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*(?:§p)?\s*\)` },
  // baseFetcher and apiFetch are the one thing renamed, so the name is read for the word
  { id: "fetch", langs: ["ts"], side: "client",
    re: String.raw`(?<!\w)(?<m>\$?o?fetch[A-Za-z_$]*|[A-Za-z_$]+Fetch[A-Za-z_$]*|useSWR|useSWRMutation|sendBeacon)\s*(?:<[^<>()]*>)?\s*\(\s*¶` },
  // a url built by hand names the host it is going to
  { id: "url", langs: ["ts"], side: "client", strict: "host",
    re: String.raw`new\s+URL\s*\(\s*§p` },
  { id: "http", langs: ["ts"], side: "client", asked: true,
    re: String.raw`\b(?:url|baseURL|endpoint|uri)\s*:\s*§p` },
  // a node server with no framework at all dispatches on the path itself
  // only where the file took a server off the runtime, or a nav highlight reads as a route
  { id: "node", langs: ["ts", "go", "python"], side: "server",
    needs: /node:http|node:https|net\/http|http\.server|BaseHTTPRequestHandler/i,
    re: String.raw`(?:pathname|\breq\.url|\brequest\.url|\bpath)\s*===?\s*§p` },
  { id: "websocket", langs: ["ts"], side: "client", method: "WS",
    re: String.raw`new\s+(?:WebSocket|EventSource|ReconnectingWebSocket|SockJS)\s*\(\s*¶` },
  // xhr.open("GET", "/x")
  { id: "http", langs: ["ts"], side: "client",
    re: String.raw`\.open\s*\(\s*§q\s*,\s*§p` },

  // ---- python ----
  // @app.get("/x") serves, requests.get("/x") calls, and both are the one shape
  { id: "http", langs: ["python"], side: "guess",
    re: String.raw`(?<at>@\s*)?(?<who>[A-Za-z_][\w.]*)\s*\.\s*(?<m>${VERBS}|route|websocket|add_get|add_post|add_put|add_patch|add_delete|add_route|request)\s*\(\s*§p` },
  { id: "flask", langs: ["python"], side: "server",
    re: String.raw`\.add_url_rule\s*\(\s*§p` },
  { id: "starlette", langs: ["python"], side: "server",
    re: String.raw`(?<!\w)(?:Route|WebSocketRoute|Mount)\s*\(\s*§p` },
  { id: "django", langs: ["python"], side: "server",
    re: String.raw`(?<!\w)(?:path|re_path|url)\s*\(\s*§p` },
  { id: "requests", langs: ["python"], side: "client",
    re: String.raw`(?<!\w)(?:requests|httpx|aiohttp|urllib3)\s*\.\s*(?<m>${VERBS}|request)\s*\(\s*¶` },
  { id: "http", langs: ["python"], side: "client",
    re: String.raw`(?<!\w)(?:urlopen|urlretrieve)\s*\(\s*§p` },
  { id: "websocket", langs: ["python"], side: "client", method: "WS",
    re: String.raw`(?<!\w)(?:websockets|websocket|ws)\s*\.\s*(?:connect|create_connection)\s*\(\s*§p` },

  // ---- the jvm ----
  // retrofit writes the verb in an annotation, and that is a call, not a route
  { id: "retrofit", langs: ["jvm"], side: "client",
    re: String.raw`@(?<m>GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*§p\s*\)` },
  { id: "spring", langs: ["jvm"], side: "server",
    re: String.raw`@(?<m>Get|Post|Put|Patch|Delete)Mapping\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?(?:\{\s*)?§p` },
  { id: "spring", langs: ["jvm"], side: "server", onClass: true,
    re: String.raw`@RequestMapping\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?(?:\{\s*)?§p` },
  { id: "jaxrs", langs: ["jvm"], side: "server", onClass: true,
    re: String.raw`@Path\s*\(\s*§p` },
  { id: "micronaut", langs: ["jvm"], side: "server",
    re: String.raw`@(?<m>Get|Post|Put|Patch|Delete)\s*\(\s*(?:uri\s*=\s*)?§p` },
  // ktor writes both sides as get("/x"), and a block after it is what serves
  { id: "ktor", langs: ["jvm"], side: "guess",
    re: String.raw`(?<!\w)(?<who>[A-Za-z_][\w.]*\s*\.\s*)?(?<m>${VERBS})\s*(?:<[^<>()]*>)?\s*\(\s*§p` },
  { id: "okhttp", langs: ["jvm"], side: "client",
    re: String.raw`\.url\s*\(\s*¶` },

  // ---- go ----
  { id: "http", langs: ["go"], side: "guess",
    re: String.raw`\b(?<who>[A-Za-z_][\w.]*)\s*\.\s*(?<m>GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Get|Post|Put|Patch|Delete|Handle|HandleFunc)\s*\(\s*§p` },
  { id: "http", langs: ["go"], side: "client",
    re: String.raw`\bhttp\.NewRequest(?:WithContext)?\s*\(\s*(?:[^,\n]*,\s*)?§q\s*,\s*§p` },
  { id: "gorilla", langs: ["go"], side: "server",
    re: String.raw`\.(?:PathPrefix|Path)\s*\(\s*§p` },

  // ---- rust ----
  { id: "actix", langs: ["rust"], side: "server",
    re: String.raw`#\[(?<m>get|post|put|patch|delete|head|options)\s*\(\s*§p` },
  { id: "axum", langs: ["rust"], side: "server",
    re: String.raw`\.route\s*\(\s*§p\s*,\s*(?:axum::routing::)?(?<m>get|post|put|patch|delete|any)\s*\(` },
  { id: "actix", langs: ["rust"], side: "server",
    re: String.raw`(?:web::)?(?:resource|scope)\s*\(\s*§p` },
  { id: "reqwest", langs: ["rust"], side: "guess",
    re: String.raw`\b(?<who>[A-Za-z_][\w:]*)\s*\.\s*(?<m>${VERBS})\s*\(\s*§p` },

  // ---- c# ----
  { id: "aspnet", langs: ["csharp"], side: "server",
    re: String.raw`\[Http(?<m>Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*§p` },
  { id: "aspnet", langs: ["csharp"], side: "server", onClass: true,
    re: String.raw`\[Route\s*\(\s*§p` },
  { id: "aspnet", langs: ["csharp"], side: "server",
    re: String.raw`\.Map(?<m>Get|Post|Put|Patch|Delete)\s*\(\s*§p` },
  { id: "http", langs: ["csharp"], side: "client",
    re: String.raw`\.(?<m>Get|Post|Put|Patch|Delete)(?:Async|StringAsync|JsonAsync|FromJsonAsync|AsJsonAsync)?\s*\(\s*§p` },

  // ---- php ----
  { id: "laravel", langs: ["php"], side: "server",
    re: String.raw`Route::(?<m>get|post|put|patch|delete|any|options)\s*\(\s*§p` },
  { id: "symfony", langs: ["php"], side: "server", onClass: true,
    re: String.raw`[#@]\[?Route\s*\(\s*(?:path\s*:\s*)?§p` },
  { id: "http", langs: ["php"], side: "guess",
    re: String.raw`(?<who>\$\w+)\s*->\s*(?<m>${VERBS})\s*\(\s*§p` },

  // ---- ruby ----
  { id: "rails", langs: ["ruby"], side: "server", files: /(^|\/)(routes|draw)\.rb$/,
    re: String.raw`(?<!\w)(?<m>get|post|put|patch|delete|match)\s+§p` },
  { id: "sinatra", langs: ["ruby"], side: "server",
    re: String.raw`(?<!\w)(?<m>get|post|put|patch|delete)\s+§p\s+do` },
  { id: "http", langs: ["ruby"], side: "client",
    re: String.raw`(?<!\w)(?:Net::HTTP|Faraday|HTTParty|RestClient|Excon)\s*\.\s*(?<m>${VERBS})\s*\(?\s*(?:URI\s*\(\s*)?§p` },

  // ---- swift ----
  { id: "vapor", langs: ["swift"], side: "guess",
    re: String.raw`\b(?<who>[A-Za-z_][\w.]*)\s*\.\s*(?<m>${VERBS})\s*\(\s*§p` },
  { id: "url", langs: ["swift"], side: "client",
    re: String.raw`URL\s*\(\s*string\s*:\s*§p` },

  // ---- a wrapper of its own, named after the verb it sends ----
  // `_getJson("/user/profile/")` and `deleteFlow("/flows/" + id)` are calls like any other
  // the jvm is left out: its own rule already reads a bare get("/x") either way
  { id: "http", langs: ["c", "swift", "csharp", "go", "rust", "python"], side: "client",
    strict: "root", needs: /http|curl|request|fetch|okhttp|retrofit|ktor|reqwest|urllib|socket|wifi|esp/i,
    re: String.raw`(?<!\w)_{0,2}(?<m>get|post|put|patch|delete|del|head)[A-Za-z_]*\s*\(\s*¶` },

  // ---- c, c++ and the boards ----
  { id: "esp", langs: ["c"], side: "server",
    re: String.raw`\.on\s*\(\s*§p\s*,` },
  { id: "http", langs: ["c"], side: "client",
    re: String.raw`\.(?:begin|setUrl)\s*\(\s*(?:[*&\w.]+\s*,\s*)?§p` },
  { id: "curl", langs: ["c"], side: "client",
    re: String.raw`CURLOPT_URL\s*,\s*§p` },
]

const COMPILED = RULES.map((one) => ({ ...one, exp: marks(one.re) }))

// the libraries each side is written with, which is what settles a guess
// prettier-ignore
const SERVERS = new Set([
  "express", "fastify", "koa", "@koa/router", "koa-router", "@hapi/hapi", "hapi", "restify",
  "polka", "connect", "hono", "elysia", "@nestjs/common", "@nestjs/core", "next-connect", "h3",
  "flask", "fastapi", "django", "rest_framework", "starlette", "sanic", "bottle", "falcon",
  "tornado", "quart", "gin", "echo", "fiber", "chi", "gorilla", "actix_web", "axum", "rocket",
  "warp", "sinatra", "rails", "vapor", "ktor",
])
// prettier-ignore
const CLIENTS = new Set([
  "axios", "ky", "got", "superagent", "node-fetch", "undici", "swr", "ofetch", "openapi-fetch",
  "@tanstack/react-query", "requests", "httpx", "urllib3", "reqwest", "okhttp3", "retrofit2",
  "faraday", "httparty", "rest-client", "guzzlehttp", "alamofire", "urllib",
  "volley", "unirest", "curl", "net", "restsharp", "refit", "flurl",
])
// what a call site is usually held in, when nothing imported says which side this is
const CALLERS =
  /^(axios\w*|api|apis|client|clients|http|https|httpClient|apiClient|fetcher|instance|agent|conn|rest|sdk|session|requests|httpx|ky|got|request|service|backend|gateway|remote)$/i
// a name that holds a client somewhere in it, since `named.get("a/b")` is a map, not a call
const HOLDS =
  /(axios|api|client|http|fetch|request|session|sdk|rest|gateway|backend|remote|service|conn|agent|instance|fetcher|caller)/i
// and what serves
const SERVES = /^(app|router|routers|server|route|routes|mux|srv|blueprint|bp|web|fastify|nest|r)$/i

// a class under the annotation, past any other annotation on the way down
const CLASSY =
  /^\s*\)?[^\n]*(?:\n\s*@[\w.]+(?:\([^)]*\))?[^\n]*)*\n\s*(?:(?:export|default|declare|public|private|protected|internal|open|final|abstract|sealed|data|static|partial|record)\s+)*(?:class|interface|object|enum|record)\s/

// a request is more than a url, and this is what stands beside one
const ASKS =
  /\b(method|headers|body|params|payload|responseType|withCredentials|credentials|signal|timeout|auth|onUploadProgress|data)\s*:/

// a path, not a sentence, a file beside this one, or a picture
const ASSET =
  /\.(tsx?|jsx?|mjs|cjs|css|scss|less|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|md|mdx|html?|txt|map|wasm|zip|pdf|mp[34]|csv|ya?ml|toml|lock|sh|py|rb|go|rs|java|kt)$/i
const RELATIVE = /^\.{1,2}\//
const MIME = /^(text|image|audio|video|application|multipart|font|model|message)\//i
const URL = /^(?:(?:https?|wss?):)?\/\/([^/?#\s]+)(\/[^\s]*)?$/i

/** a route a framework named itself, where the path may be one parameter or nothing */
const soft = (text: string): boolean =>
  text.length < 300 && !/[\s\\]/.test(text) && !RELATIVE.test(text) && !ASSET.test(text)

/** whether a string is worth reading as a route at all */
export function pathy(text: string): boolean {
  if (!text || text.length > 300 || /[\s\\]/.test(text)) return false
  if (RELATIVE.test(text) || text.startsWith("~")) return false
  if (URL.test(text)) return !ASSET.test(text)
  if (/^[A-Za-z]:\//.test(text) || MIME.test(text)) return false
  // a lone star is every path there is, and a bare word names nothing
  if (!text.includes("/")) return false
  if (ASSET.test(text)) return false
  return true
}

// what stands in for a value: :id, {id}, <int:id>, [id], $id, \(id), a hole, (?P<id>\d+)
const HOLE =
  /\(\?P?<[^>]*>[^)]*\)|\\\([^)]*\)|\([^)]*\)|\$?\{[^{}]*\}|\$[A-Za-z_]\w*|<[^>/]*>|:[A-Za-z_]\w*|\[[^\]/]*\]|%[sdv]/g

// the same, as the languages that interpolate with a dollar or a backslash write it
const HOLES = /\$\{([^{}]*)\}|\{([^{}]*)\}|\$([A-Za-z_]\w*)|\\\(([^()]*)\)/g

// a name bound to one string, which is what a base url is usually held in
const ASSIGN = marks(String.raw`([A-Za-z_$][\w$.]*)\s*(?::\s*[^=\n]+)?=\s*(?:new\s+URL\s*\(\s*)?§`)

/** every hole a template left, filled from the names this file binds to a string */
export function filled(raw: string, consts: Map<string, string>): string {
  let text = raw
  for (let round = 0; round < 2 && /[{$\\]/.test(text); round++) {
    const was = text
    text = text.replace(HOLES, (whole, ...held: (string | undefined)[]) => {
      const name = held.slice(0, 4).find((one) => one !== undefined) ?? ""
      const found = consts.get(name) ?? consts.get(name.split(".").pop() ?? "")
      return found && found !== raw ? found : whole
    })
    if (text === was) break
  }
  return text
}

/** the path as it is matched on, and the host it named if it named one */
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

const segments = (path: string) => path.split("/").filter(Boolean)

/** two prefixes and a path, joined without a doubled or a missing slash */
const under = (...parts: string[]) =>
  `/${parts.flatMap((one) => segments(one)).join("/")}`.replace(/\/+$/, "") || "/"

const HOSTLESS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\*[\w.*-]*|[\w-]+\.local)(:\d+)?$/i

/** the call sites and the endpoints matched up, the longest literal run winning */
export function link(endpoints: Endpoint[], clients: Client[]): Link[] {
  const held = endpoints.map((one) => ({ one, segs: segments(one.path) }))
  const links: Link[] = []
  for (const client of clients) {
    const want = segments(client.path)
    // a call that names a host is a call to that host, since nothing here knows what this
    // fleet deploys as: api.openai.com/v1/chat/completions matched a repo's own openai route
    if (client.host && !HOSTLESS.test(client.host)) continue
    let best: { score: number; end: Endpoint; how: Link["how"] } | null = null
    // what a client holds as a base url is leading segments this repo never wrote
    for (let from = 0; from < Math.max(1, Math.min(5, want.length)); from++) {
      const tail = want.slice(from)
      if (!tail.length) break
      for (const { one, segs } of held) {
        const wide = segs.at(-1) === "**"
        if (wide ? tail.length < segs.length - 1 : tail.length !== segs.length) continue
        if (one.method !== "ANY" && client.method !== "ANY" && one.method !== client.method)
          continue
        let literal = 0
        // a value the caller held against a word the route wrote, which is weak evidence
        let loose = 0
        let ok = true
        for (const [i, seg] of segs.entries()) {
          if (seg === "**") break
          const said = tail[i]
          // a parameter of the route takes whatever the caller put there
          if (seg === "*") continue
          if (said === "*") {
            loose++
            continue
          }
          if (seg.toLowerCase() !== said.toLowerCase()) {
            ok = false
            break
          }
          literal++
        }
        if (!ok || !literal || literal < (loose ? 2 : 1)) continue
        const score = literal * 4 - from - (one.method === client.method ? 0 : 1)
        if (!best || score > best.score) best = { score, end: one, how: from ? "tail" : "exact" }
      }
      if (best) break
    }
    if (!best) continue
    links.push({
      from: client.file,
      to: best.end.handler ?? best.end.file,
      call: client.id,
      endpoint: best.end.id,
      method: client.method === "ANY" ? best.end.method : client.method,
      path: best.end.path,
      how: best.how,
    })
  }
  return links
}

interface Action {
  name: string
  detail: boolean
  methods: string[]
  path: string
}

/** what one repo holds before any of it is joined up */
export interface Found {
  endpoints: Endpoint[]
  clients: Client[]
  /** a file mounting another file's routes under a prefix */
  mounts: { from: string; prefix: string; into: string }[]
  /** what a file's own routes sit under, from the line it is said on */
  prefixes: { file: string; line: number; path: string }[]
  /** a viewset registered on a router, which is a handful of routes */
  registered: { file: string; router: string; prefix: string; name: string; line: number }[]
  /** a router included under a prefix, by the name it is held in */
  routers: Record<string, string>
  /** what a class adds to a router of its own accord */
  actions: Record<string, Action[]>
  /** every declaration name to the file declaring it, when only one does */
  declares: Map<string, string[]>
}

const empty = (): Found => ({
  endpoints: [],
  clients: [],
  mounts: [],
  prefixes: [],
  registered: [],
  routers: {},
  actions: {},
  declares: new Map(),
})

/** the file declaring a name, or the nearest one when two files declare it alike */
function nearest(held: string[] | undefined, from: string): string | undefined {
  if (!held?.length) return undefined
  const mine = from.split("/")
  const shared = (one: string) => {
    const parts = one.split("/")
    let n = 0
    while (n < parts.length - 1 && n < mine.length - 1 && parts[n] === mine[n]) n++
    return n
  }
  const ranked = [...held].sort((a, b) => shared(b) - shared(a))
  // two files the same distance away is no answer at all
  return ranked.length > 1 && shared(ranked[0]) === shared(ranked[1]) ? undefined : ranked[0]
}

/** where every line starts, so a line number is a lookup rather than a count */
const breaks = (code: string): number[] => {
  const at = [0]
  for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) at.push(i + 1)
  return at
}

const lineAt = (starts: number[], index: number): number => {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= index) low = mid
    else high = mid - 1
  }
  return low + 1
}

/** one verb, whatever the library called it */
function verbOf(said: string): string {
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

/** a file based router: the folders themselves are the path */
function routed(path: string): { path: string; framework: string } | null {
  const parts = path.split("/")
  const file = parts.at(-1) ?? ""
  const at = (name: string) => parts.lastIndexOf(name)
  const walk = (from: number, to: number) =>
    parts
      .slice(from, to)
      .filter((one) => !/^\(.*\)$/.test(one) && !one.startsWith("@") && !one.startsWith("_"))
      .map((one) => (one.startsWith("[") ? (one.includes("...") ? "**" : "*") : one))
  // next app router: app/api/things/[id]/route.ts
  if (/^route\.[jt]sx?$/.test(file) && at("app") !== -1)
    return { path: under(walk(at("app") + 1, parts.length - 1).join("/")), framework: "next" }
  // sveltekit: routes/api/things/+server.ts
  if (/^\+server\.[jt]s$/.test(file) && at("routes") !== -1)
    return {
      path: under(walk(at("routes") + 1, parts.length - 1).join("/")),
      framework: "sveltekit",
    }
  // next pages router
  const pages = at("pages")
  if (pages !== -1 && parts[pages + 1] === "api" && /\.[jt]sx?$/.test(file))
    return {
      path: under(
        ...[...walk(pages + 1, parts.length - 1), file.replace(/\.[jt]sx?$/, "")].filter(
          (one) => one !== "index",
        ),
      ),
      framework: "next",
    }
  // nitro: routes/api/things.get.ts, where the verb is part of the name
  const nitro = at("routes")
  if (
    nitro !== -1 &&
    /\.[jt]sx?$/.test(file) &&
    (/\.(get|post|put|patch|delete)\.[jt]sx?$/.test(file) || parts[nitro + 1] === "api")
  )
    return {
      path: under(
        ...[
          ...walk(nitro + 1, parts.length - 1),
          file.replace(/\.(get|post|put|patch|delete)?\.?[jt]sx?$/, ""),
        ].filter((one) => one && one !== "index"),
      ),
      framework: "nitro",
    }
  // nuxt and nitro: server/api/things.get.ts
  const server = at("server")
  if (server !== -1 && ["api", "routes"].includes(parts[server + 1] ?? "") && /\.[jt]s$/.test(file))
    return {
      path: under(
        ...[
          ...walk(server + 1, parts.length - 1),
          file.replace(/\.(get|post|put|patch|delete)?\.?[jt]s$/, "").replace(/\.[jt]s$/, ""),
        ].filter((one) => one && one !== "index"),
      ),
      framework: "nuxt",
    }
  return null
}

// what a file based route hands out, one per verb it exports
const EXPORTED =
  /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g

const MOUNTED = marks(
  String.raw`\.(?:use|mount|register)\s*\(\s*§p\s*,\s*(?<who>[A-Za-z_$][\w$.]*)`,
)
const INCLUDED = marks(
  String.raw`include_router\s*\(\s*([A-Za-z_][\w.]*)\s*(?:,\s*prefix\s*=\s*§)?`,
)
const BLUEPRINT = marks(
  String.raw`register_blueprint\s*\(\s*([A-Za-z_][\w.]*)\s*(?:,\s*url_prefix\s*=\s*§)?`,
)
// the same annotation names a prefix on a class and a route on a method, in four languages
const CONTROLLER = marks(
  String.raw`[#@\[]\s*\[?(?:Controller|RestController|RequestMapping|ApiController|Path|Route)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?§`,
)
// the whole word, or `sort_prefix = "-"` reads as one
const PREFIX = marks(String.raw`\b(?:prefix|url_prefix|basePath|base_url|baseURL)\s*[=:]\s*§`)
const INCLUDE = marks(
  String.raw`(?:path|re_path|url)\s*\(\s*§\s*,\s*include\s*\(\s*(?:\(\s*)?(?:§|([A-Za-z_][\w.]*))`,
)
const REGISTER = marks(String.raw`([A-Za-z_]\w*)\s*\.\s*register\s*\(\s*§\s*,\s*([A-Za-z_]\w*)`)
const ROUTERS = marks(String.raw`include\s*\(\s*([A-Za-z_]\w*)\s*\.\s*urls\s*\)`)
const ACTION =
  /@action\s*\(((?:[^()]|\([^()]*\))*)\)\s*\n(?:\s*@[^\n]*\n)*\s*(?:async\s+)?def\s+(\w+)/g
const METHODS = /methods\s*=\s*[[({]([^\])}]*)/
const DETAIL = /detail\s*=\s*(True|true|False|false)/

/** every name a file binds, and the file it came from, so a mount can be followed */
function wiring(repo: string, graph: Graph): Map<string, Map<string, string>> {
  const all = new Map<string, Map<string, string>>()
  for (const module of Object.values(graph.modules)) {
    const local = new Map<string, string>()
    let text = ""
    try {
      text = readFileSync(join(repo, module.path), "utf8")
    } catch {
      continue
    }
    const dialect = dialectOf(module.path)
    if (dialect && dialect.id !== "ts") {
      for (const spec of foreign(text, dialect)) {
        const file = module.imports[spec.text]
        const tail =
          spec.text
            .split(/[.:/]+/)
            .filter(Boolean)
            .pop() ?? ""
        if (file && tail) local.set(tail, file)
      }
    } else {
      for (const spec of specifiers(text)) {
        const file = module.imports[spec.text]
        if (!file) continue
        for (const bound of spec.names) local.set(bound.local, file)
      }
    }
    all.set(module.path, local)
  }
  return all
}

/** every endpoint and every call site in one repo, before the prefixes are applied */
function collect(repo: string, graph: Graph = build(repo), calls?: Calls): Found {
  const all = empty()
  const binds = wiring(repo, graph)
  for (const id of Object.keys(calls?.symbols ?? {})) {
    const [file, name] = id.split("#")
    all.declares.set(name, [...(all.declares.get(name) ?? []), file])
  }
  // a module file by its own name, since `from api import things` names only api
  const byName = new Map<string, string[]>()
  for (const path of Object.keys(graph?.modules ?? {})) {
    const base = (path.split("/").pop() ?? "").replace(/\.\w+$/, "")
    byName.set(base, [...(byName.get(base) ?? []), path])
  }
  const holds = (name: string, from: string): string | undefined => {
    const local = binds.get(from)?.get(name)
    if (local) return local
    const held = nearest(all.declares.get(name), from)
    return held && held !== from ? held : undefined
  }

  // itself and one hop out: a header holds the http library, the file beside it the calls
  const around = new Map<string, string>()
  for (const module of Object.values(graph.modules))
    around.set(
      module.path,
      [
        ...module.packages,
        ...module.out.flatMap((edge) => graph.modules[edge.to]?.packages ?? []),
      ].join(" "),
    )

  for (const module of Object.values(graph.modules)) {
    const path = module.path
    const dialect = dialectOf(path)
    const lang = dialect?.id ?? ""
    let text = ""
    try {
      text = readFileSync(join(repo, path), "utf8")
    } catch {
      continue
    }
    const { code, strings } = scrub(text, dialect?.flavour ?? "js", true)
    const starts = breaks(code)
    const at = (index: number) => lineAt(starts, index)
    const said = (index: string | undefined) =>
      index === undefined ? "" : (strings[Number(index)] ?? "")

    // a base url is a name bound to a string, and the holes are filled from those
    const consts = new Map<string, string>()
    for (const m of code.matchAll(ASSIGN)) {
      const value = said(m[2])
      if (!value || /[\s\\]/.test(value) || value.length > 200) continue
      const keys = [m[1], m[1].split(".").pop() ?? ""]
      // a url beats a bare word, and the first one written beats a later one
      for (const key of keys)
        if (key && (!consts.has(key) || (URL.test(value) && !URL.test(consts.get(key)!))))
          consts.set(key, value)
    }

    // the folders are the path, and the file says which verbs answer on it
    const own = routed(path)
    if (own) {
      const verbs = [...code.matchAll(EXPORTED)].map((m) => [m[1], m.index] as [string, number])
      const named = /\.(get|post|put|patch|delete)\.[jt]sx?$/.exec(path)?.[1]?.toUpperCase()
      for (const [method, index] of verbs.length
        ? verbs
        : [[named ?? "ANY", 0] as [string, number]])
        all.endpoints.push({
          id: `${path}:${at(index)}:${method}:${own.path}`,
          file: path,
          line: at(index),
          method,
          path: own.path,
          raw: own.path,
          framework: own.framework,
        })
    }

    for (const rule of COMPILED) {
      if (!rule.langs.includes(lang)) continue
      if (rule.files && !rule.files.test(path)) continue
      if (rule.needs && !rule.needs.test(around.get(path) ?? "")) continue
      for (const m of code.matchAll(rule.exp)) {
        const groups = m.groups ?? {}
        const held = said(groups.p) || (groups.v ? (consts.get(groups.v) ?? "") : "")
        const after = code.slice(m.index + m[0].length, m.index + m[0].length + 120)
        const raw = filled(held && groups.p ? held + stretch(after, strings) : held, consts)
        if (!raw ? !rule.bare : !(rule.side === "server" ? soft(raw) : pathy(raw))) continue
        if (rule.strict === "root" && !raw.startsWith("/") && !URL.test(raw)) continue
        if (rule.strict === "host" && !URL.test(raw)) continue
        const line = at(m.index)
        // a url beside a method and a body is a request, and beside a date it is a sitemap
        if (rule.asked && !ASKS.test(code.slice(Math.max(0, m.index - 200), m.index + 200)))
          continue
        const method = verbOf(groups.m || said(groups.q) || rule.method || "ANY")
        const side =
          rule.side === "guess" ? guess(groups, raw, after, module.packages, lang) : rule.side
        if (!side) continue
        // a mount is not a route, and an annotation over a class is a prefix
        if (side === "server" && /^\s*,\s*include\s*\(/.test(after)) continue
        if (rule.onClass && CLASSY.test(after)) continue
        const { path: clean, host } = normal(raw || "/")
        if (side === "server") {
          const wants = METHODS.exec(after)
          const listed = wants
            ? [...wants[1].matchAll(marks("§"))].map((one) => verbOf(said(one[1])))
            : []
          for (const verb of listed.length ? listed : [method])
            all.endpoints.push({
              id: `${path}:${line}:${verb}:${clean}`,
              file: path,
              line,
              method: verb,
              path: clean,
              raw,
              framework: rule.id,
              handler: handlerOf(after, path, holds),
            })
        } else {
          // fetch keeps its verb in the options object
          const said = method === "ANY" ? verbOf(sent(after, strings)) : method
          all.clients.push({
            id: `${path}:${line}:${said}:${clean}`,
            file: path,
            line,
            method: said,
            path: clean,
            raw,
            framework: rule.id,
            host,
          })
        }
      }
    }

    // rails writes seven routes as one word
    if (lang === "ruby" && /(^|\/)routes\.rb$/.test(path))
      for (const m of code.matchAll(/(?<!\w)resources?\s+:(\w+)/g)) {
        const base = `/${m[1]}`
        for (const [one, verb] of [
          [base, "GET"],
          [base, "POST"],
          [`${base}/new`, "GET"],
          [`${base}/*`, "GET"],
          [`${base}/*`, "PUT"],
          [`${base}/*`, "DELETE"],
          [`${base}/*/edit`, "GET"],
        ])
          all.endpoints.push({
            id: `${path}:${at(m.index)}:${verb}:${one}`,
            file: path,
            line: at(m.index),
            method: verb,
            path: one,
            raw: m[0],
            framework: "rails",
          })
      }

    // what this file's routes hang under, and what it hangs somewhere else
    for (const [exp, kind] of [
      [CONTROLLER, "class"],
      [PREFIX, "file"],
    ] as const) {
      for (const m of code.matchAll(exp)) {
        const raw = said(m[1])
        // a prefix is a path, so it holds a word: "-" and "" are something else entirely
        if (!raw || /[\s\\]/.test(raw) || URL.test(raw) || !/[A-Za-z]/.test(raw)) continue
        // and only a prefix when a class stands under it
        if (
          kind === "class" &&
          !CLASSY.test(code.slice(m.index + m[0].length, m.index + m[0].length + 200))
        )
          continue
        all.prefixes.push({ file: path, line: kind === "file" ? 0 : at(m.index), path: raw })
      }
    }
    const named = (name: string) => {
      const head = name.split(".")[0]
      const bound = binds.get(path)?.get(head)
      if (bound) return bound
      // one file in the repo is called that, which is what python's own import names
      const held = byName.get(head)
      return held?.length === 1 && held[0] !== path ? held[0] : ""
    }
    if (lang === "ts")
      for (const m of code.matchAll(MOUNTED)) {
        const prefix = said(m.groups!.p)
        const into = named(m.groups!.who ?? "")
        if (into && pathy(prefix)) all.mounts.push({ from: path, prefix, into })
      }
    if (lang === "python") {
      for (const exp of [INCLUDED, BLUEPRINT])
        for (const m of code.matchAll(exp)) {
          const into = named(m[1])
          if (into) all.mounts.push({ from: path, prefix: said(m[2]), into })
        }
      for (const m of code.matchAll(INCLUDE)) {
        const prefix = said(m[1])
        if (m[2] !== undefined) {
          const into = moduleFile(graph, path, said(m[2]))
          if (into) all.mounts.push({ from: path, prefix, into })
        } else if (m[3]) all.routers[`${path}#${m[3].split(".")[0]}`] = prefix
      }
      for (const m of code.matchAll(ROUTERS)) all.routers[`${path}#${m[1]}`] ??= ""
      for (const m of code.matchAll(REGISTER)) {
        // registries other than a router have the same shape, so the name has to say so
        if (!/urls?\.py$/.test(path) && !/router/i.test(m[1])) continue
        all.registered.push({
          file: path,
          router: m[1],
          prefix: said(m[2]),
          name: m[3],
          line: at(m.index),
        })
      }
      for (const m of code.matchAll(ACTION)) {
        const held = m[1]
        const klass = `${path}#${classAt(code, m.index)}`
        const methods = METHODS.exec(held)
        all.actions[klass] = [
          ...(all.actions[klass] ?? []),
          {
            name: m[2],
            detail: !/false/i.test(DETAIL.exec(held)?.[1] ?? "true"),
            methods: methods
              ? [...methods[1].matchAll(marks("§"))].map((one) => verbOf(said(one[1])))
              : ["ANY"],
            path:
              said(marks(String.raw`url_path\s*=\s*§`).exec(held)?.[1]) || m[2].replace(/_/g, "-"),
          },
        ]
      }
    }
  }
  return all
}

// `"/flows/" + id + "/"` is one path written in three pieces
const PLUS = new RegExp(
  `^\\s*\\+\\s*(?:[rbuf]{0,2}${MARK}(\\d+)${MARK}|[A-Za-z_$][\\w$.]*(?:\\([^()]*\\))?)`,
)

/** whatever a concatenation adds to a path, a value it cannot read being one star */
function stretch(after: string, strings: string[]): string {
  let text = ""
  let rest = after
  for (let hop = 0; hop < 8; hop++) {
    const m = PLUS.exec(rest)
    if (!m) break
    text += m[1] === undefined ? "*" : (strings[Number(m[1])] ?? "")
    rest = rest.slice(m[0].length)
  }
  return text
}

const SENT = marks(String.raw`\bmethod\s*[=:]\s*§`)

/** the verb an options object holds, for a call that names none itself */
function sent(after: string, strings: string[]): string {
  const found = SENT.exec(after)
  SENT.lastIndex = 0
  return found ? (strings[Number(found[1])] ?? "") : ""
}

/** which side of the wire a shape belongs to, when the shape alone is both */
function guess(
  groups: Record<string, string | undefined>,
  raw: string,
  after: string,
  packages: string[],
  lang: string,
): "server" | "client" | "" {
  const who =
    (groups.who ?? "")
      .replace(/[\s.]+$/, "")
      .split(".")
      .pop() ?? ""
  const held = groups.who ?? ""
  // a decorator over a def is a route, whatever the thing holding it is called
  if (groups.at) return "server"
  if (URL.test(raw)) return "client"
  // a jvm package is written as two segments, so the head of one is the library
  const head = (one: string) => one.split(/[./]/)[0]
  const serves = packages.some((one) => SERVERS.has(one) || SERVERS.has(head(one)))
  const calls = packages.some((one) => CLIENTS.has(one) || CLIENTS.has(head(one)))
  // a block right after the path is a route body, whatever else the file imports
  if (lang !== "ts" && /^\s*\)?\s*\{/.test(after)) return "server"
  // python serves through a decorator or a router method, so the rest is a call, tests included
  if (lang === "python")
    return /^add_/.test(groups.m ?? "") ? "server" : calls || HOLDS.test(held) ? "client" : ""
  if (serves && !calls) return "server"
  if (calls && !serves) return "client"
  if (CALLERS.test(who) && !SERVES.test(who)) return "client"
  if (SERVES.test(who) && !CALLERS.test(who)) return "server"
  // a handler follows a route, and options, a block or nothing follow a call
  if (/^\s*,\s*(?:async\s*)?(?:\(|function|\[|[A-Za-z_$][\w$.]*\s*[,)])/.test(after))
    return "server"
  // nothing said which side, so the name has to hold a client for this to be one at all
  return HOLDS.test(held) ? "client" : ""
}

/** the file behind a route, when the route only names the thing that answers it */
function handlerOf(
  after: string,
  from: string,
  holds: (name: string, from: string) => string | undefined,
): string | undefined {
  // `response=Chat` names an argument, not the thing that answers the route
  // the comma is optional: a rule may have read the verb wrapping the handler already
  const found = /^\s*(?:,\s*)?([A-Za-z_$][\w$.:]*)\s*(?:(\()|(?=[,)]|$))/.exec(after)
  // and axum wraps the thing in its verb: `.route("/x", get(health::health))`
  const named =
    found?.[2] && /^(get|post|put|patch|delete|any|head|options)$/.test(found[1])
      ? /^\s*(?:,\s*)?[\w$.:]*\(\s*([A-Za-z_$][\w$.:]*)/.exec(after)?.[1]
      : found?.[1]
  if (!named) return undefined
  const held = holds(named.split(/[.:]/)[0], from)
  return held && held !== from ? held : undefined
}

/** a module named as a string, the way python mounts one urlconf inside another */
function moduleFile(graph: Graph, from: string, text: string): string {
  const dialect = dialectOf(from)
  if (!dialect || !text) return ""
  for (const one of candidates(dialect, text, from)) if (graph.modules[one]) return one
  return ""
}

/** the class a decorator sits inside */
function classAt(code: string, at: number): string {
  const found = [...code.slice(0, at).matchAll(/^class\s+(\w+)/gm)]
  return found.at(-1)?.[1] ?? ""
}

/** what every file's routes sit under, following the mounts from wherever they start */
function prefixes(found: Found): Map<string, string[]> {
  const into = new Map<string, { prefix: string; from: string }[]>()
  for (const one of found.mounts)
    into.set(one.into, [...(into.get(one.into) ?? []), { prefix: one.prefix, from: one.from }])
  const roots = new Set<string>()
  for (const one of found.mounts) if (!into.has(one.from)) roots.add(one.from)
  for (const one of found.endpoints) if (!into.has(one.file)) roots.add(one.file)
  for (const one of found.registered) if (!into.has(one.file)) roots.add(one.file)
  const held = new Map<string, string[]>()
  const walk = (file: string, prefix: string, seen: Set<string>) => {
    const mine = held.get(file) ?? []
    if (mine.includes(prefix) || mine.length > 4 || seen.has(file)) return
    held.set(file, [...mine, prefix])
    for (const one of found.mounts.filter((m) => m.from === file))
      walk(one.into, under(prefix, one.prefix), new Set([...seen, file]))
  }
  for (const file of roots) walk(file, "", new Set())
  // a file nothing mounts still serves what it holds
  for (const one of [...found.endpoints, ...found.registered])
    if (!held.has(one.file)) held.set(one.file, [""])
  return held
}

/** the endpoints as they answer, prefixes applied and every registered viewset spread out */
function serving(found: Found): Endpoint[] {
  const held = prefixes(found)
  const inFile = new Map<string, { line: number; path: string }[]>()
  for (const one of found.prefixes)
    inFile.set(one.file, [...(inFile.get(one.file) ?? []), { line: one.line, path: one.path }])
  const above = (file: string, line: number) => {
    const mine = (inFile.get(file) ?? []).filter((one) => one.line <= line)
    return mine.at(-1)?.path ?? ""
  }
  const out: Endpoint[] = []
  for (const one of found.endpoints)
    for (const prefix of held.get(one.file) ?? [""]) {
      // a file based route is already the whole path, and nothing mounts it
      const path = one.framework.match(/^(next|sveltekit|nuxt)$/)
        ? one.path
        : under(prefix, above(one.file, one.line), one.path)
      out.push({ ...one, path, id: `${one.file}:${one.line}:${one.method}:${path}` })
    }
  // a viewset is a list, a detail and whatever it adds itself
  for (const one of found.registered) {
    const holders = found.declares.get(one.name) ?? []
    const handler = nearest(holders, one.file)
    for (const prefix of held.get(one.file) ?? [""]) {
      const base = under(prefix, found.routers[`${one.file}#${one.router}`] ?? "", one.prefix)
      const made: [string, string][] = [
        [base, "GET"],
        [base, "POST"],
        [`${base}/*`, "GET"],
        [`${base}/*`, "PUT"],
        [`${base}/*`, "PATCH"],
        [`${base}/*`, "DELETE"],
      ]
      // an action writes its own url, regex and parameters and all
      // and when two files declare that name alike, whatever either of them adds
      const added = handler
        ? (found.actions[`${handler}#${one.name}`] ?? [])
        : holders.flatMap((file) => found.actions[`${file}#${one.name}`] ?? [])
      for (const action of added)
        for (const verb of action.methods)
          made.push([normal(under(base, action.detail ? "*" : "", action.path)).path, verb])
      for (const [path, method] of made)
        out.push({
          id: `${one.file}:${one.line}:${method}:${path}`,
          file: one.file,
          line: one.line,
          method,
          path,
          raw: one.prefix,
          framework: "drf",
          handler,
        })
    }
  }
  return out
}

/** the same route read twice by two patterns is one route, and the named library wins */
const once = <T extends { id: string; framework: string }>(held: T[]): T[] => {
  const by = new Map<string, T>()
  for (const one of held) {
    const seen = by.get(one.id)
    if (!seen || (seen.framework === "http" && one.framework !== "http")) by.set(one.id, one)
  }
  return [...by.values()]
}

/** what a repo serves and what it calls, ready to be matched against anything else */
export function reading(
  repo: string,
  graph: Graph = build(repo),
  // a route names the thing that answers it, and only the call graph knows where that is
  calls: Calls = callGraph(repo, graph),
): Omit<Api, "links" | "stats"> {
  const found = collect(repo, graph, calls)
  return { endpoints: once(serving(found)), clients: once(found.clients) }
}

/** one repo's endpoints, its call sites, and every edge between them */
export function api(repo: string, graph?: Graph, calls?: Calls): Api {
  const { endpoints, clients } = reading(repo, graph, calls)
  return joined(endpoints, clients)
}

/** the same, once several repos have been read into one list */
export function joined(endpoints: Endpoint[], clients: Client[]): Api {
  const links = link(endpoints, clients)
  const reached = new Set(links.map((one) => one.call))
  return {
    endpoints,
    clients,
    links,
    stats: {
      endpoints: endpoints.length,
      clients: clients.length,
      linked: reached.size,
      outside: clients.length - reached.size,
      frameworks: [...new Set([...endpoints, ...clients].map((one) => one.framework))].sort(),
    },
  }
}
