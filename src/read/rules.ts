// owner: finn
// goal: the one table saying what an endpoint and a call site look like, per framework

import { MARK } from "./specifiers.ts"
import { URL } from "./specs.ts"

// § is a string the scrub took out, its letter kept (python writes half its routes as r"")
// and ¶ is that or a name holding one, since fetch(url) is written as often
export const marks = (src: string): RegExp =>
  new RegExp(
    src
      .replace(/¶/g, `(?:[rbuf]{0,2}${MARK}(?<p>\\d+)${MARK}|(?<v>[A-Za-z_$][\\w$.]*))`)
      .replace(/§(\w)?/g, (_, name: string | undefined) =>
        name ? `[rbuf]{0,2}${MARK}(?<${name}>\\d+)${MARK}` : `[rbuf]{0,2}${MARK}(\\d+)${MARK}`,
      ),
    "g",
  )

export const VERBS = "get|post|put|patch|delete|head|options"

// a request is more than a url, and this is what stands beside one
export const ASKS =
  /\b(method|headers|body|params|payload|responseType|withCredentials|credentials|signal|timeout|auth|onUploadProgress)\s*:/

export interface Rule {
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
  /** what has to stand within a couple of lines, for a rule a bare path would fool */
  near?: RegExp
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
  { id: "http", langs: ["ts"], side: "guess", near: ASKS,
    re: String.raw`\b(?:url|baseURL|endpoint|uri)\s*:\s*§p` },
  // hapi, fastify and convex all write the whole route as one object
  { id: "object", langs: ["ts"], side: "server", near: /\bhandler\s*:|\bpreHandler\s*:/,
    re: String.raw`\bpath\s*:\s*§p` },
  // a node server with no framework at all dispatches on the path itself
  // only where the file took a server off the runtime, or a nav highlight reads as a route
  { id: "node", langs: ["ts", "go", "python"], side: "server",
    needs: /node:http|node:https|net\/http|http\.server|BaseHTTPRequestHandler/i,
    re: String.raw`(?:pathname|\breq\.url|\brequest\.url|\bpath)\s*===?\s*§p` },
  // bun and deno hand the runtime a table of paths rather than calling a router
  { id: "bun", langs: ["ts"], side: "server", near: /\broutes\s*:|Bun\.serve|Deno\.serve/,
    re: String.raw`§p\s*:\s*(?:\{|async\b|\(|[A-Za-z_$][\w$.]*\s*[,}])` },
  { id: "websocket", langs: ["ts"], side: "client", method: "WS",
    re: String.raw`new\s+(?:WebSocket|EventSource|ReconnectingWebSocket|SockJS)\s*\(\s*¶` },
  // xhr.open("GET", "/x"), and angular's request object written the same way round
  { id: "http", langs: ["ts"], side: "client",
    re: String.raw`(?:\.open|new\s+HttpRequest)\s*\(\s*§q\s*,\s*§p` },

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
  // flask-restful names the class first and the path second
  { id: "flask", langs: ["python"], side: "server",
    re: String.raw`add_resource\s*\(\s*[\w.]+\s*,\s*§p` },
  // tornado writes its table as tuples, and the handler class is what says so
  { id: "tornado", langs: ["python"], side: "server",
    re: String.raw`\(\s*§p\s*,\s*[A-Za-z_]\w*Handler` },
  // bottle and sanic decorate with no router in front. Not patch: that is mock's word
  { id: "bottle", langs: ["python"], side: "server",
    re: String.raw`@\s*(?<m>route|get|post|put|delete)\s*\(\s*§p` },
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
  // spring writes its own client two ways, and neither of them is a route
  { id: "spring", langs: ["jvm"], side: "client",
    re: String.raw`\.uri\s*\(\s*§p` },
  { id: "spring", langs: ["jvm"], side: "client",
    re: String.raw`\.(?<m>get|post|put|delete|patch)For(?:Object|Entity)\s*\(\s*§p` },

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
  // refit declares a client the way retrofit does, in attributes on an interface
  { id: "refit", langs: ["csharp"], side: "client",
    re: String.raw`\[(?<m>Get|Post|Put|Patch|Delete)\s*\(\s*§p\s*\)\]` },
  { id: "http", langs: ["csharp"], side: "client",
    re: String.raw`\.(?<m>Get|Post|Put|Patch|Delete)(?:Async|StringAsync|JsonAsync|FromJsonAsync|AsJsonAsync)?\s*\(\s*§p` },

  // ---- php ----
  { id: "laravel", langs: ["php"], side: "server",
    re: String.raw`Route::(?<m>get|post|put|patch|delete|any|options)\s*\(\s*§p` },
  { id: "symfony", langs: ["php"], side: "server", onClass: true,
    re: String.raw`[#@]\[?Route\s*\(\s*(?:path\s*:\s*)?§p` },
  { id: "guzzle", langs: ["php"], side: "client",
    re: String.raw`->\s*(?:request|requestAsync)\s*\(\s*§q\s*,\s*§p` },
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
  { id: "alamofire", langs: ["swift"], side: "client",
    re: String.raw`(?:AF|Alamofire|session)\s*\.\s*request\s*\(\s*§p` },
  { id: "url", langs: ["swift"], side: "client",
    re: String.raw`URL\s*\(\s*string\s*:\s*§p` },

  // ---- dart ----
  // http.get(Uri.parse("/x")) calls, shelf's router.get("/x", handler) serves, one shape
  { id: "http", langs: ["dart"], side: "guess",
    re: String.raw`(?<who>[A-Za-z_$][\w$]*)\s*\.\s*(?<m>${VERBS})\s*(?:<[^<>()]*>)?\s*\(\s*(?:Uri\s*\.\s*parse\s*\(\s*)?¶` },
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

export const COMPILED = RULES.map((one) => ({ ...one, exp: marks(one.re) }))

// the libraries each side is written with, which is what settles a guess
// prettier-ignore
export const SERVERS = new Set([
  "express", "fastify", "koa", "@koa/router", "koa-router", "@hapi/hapi", "hapi", "restify",
  "polka", "connect", "hono", "elysia", "@nestjs/common", "@nestjs/core", "next-connect", "h3",
  "flask", "fastapi", "django", "rest_framework", "starlette", "sanic", "bottle", "falcon",
  "tornado", "quart", "gin", "echo", "fiber", "chi", "gorilla", "actix_web", "axum", "rocket",
  "warp", "sinatra", "rails", "vapor", "ktor", "shelf", "shelf_router", "dart_frog",
])
// prettier-ignore
export const CLIENTS = new Set([
  "axios", "ky", "got", "superagent", "node-fetch", "undici", "swr", "ofetch", "openapi-fetch",
  "@tanstack/react-query", "requests", "httpx", "urllib3", "reqwest", "okhttp3", "retrofit2",
  "faraday", "httparty", "rest-client", "guzzlehttp", "alamofire", "urllib",
  "volley", "unirest", "curl", "net", "restsharp", "refit", "flurl", "dio", "chopper",
])
// what a call site is usually held in, when nothing imported says which side this is
export const CALLERS =
  /^(axios\w*|api|apis|client|clients|http|https|httpClient|apiClient|fetcher|instance|agent|conn|rest|sdk|session|requests|httpx|ky|got|request|service|backend|gateway|remote)$/i
// a name that holds a client somewhere in it, since `named.get("a/b")` is a map, not a call
export const HOLDS =
  /(axios|api|client|http|fetch|request|session|sdk|rest|gateway|backend|remote|service|conn|agent|instance|fetcher|caller)/i
// and what serves
export const SERVES =
  /^(app|router|routers|server|route|routes|mux|srv|blueprint|bp|web|fastify|nest|r)$/i

// a class under the annotation, past any other annotation on the way down
export const CLASSY =
  /^\s*\)?[^\n]*(?:\n\s*@[\w.]+(?:\([^)]*\))?[^\n]*)*\n\s*(?:(?:export|default|declare|public|private|protected|internal|open|final|abstract|sealed|data|static|partial|record)\s+)*(?:class|interface|object|enum|record)\s/

// a path, not a sentence, a file beside this one, or a picture
export const ASSET =
  /\.(tsx?|jsx?|mjs|cjs|css|scss|less|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|md|mdx|html?|txt|map|wasm|zip|pdf|mp[34]|csv|ya?ml|toml|lock|sh|py|rb|go|rs|java|kt)$/i
export const RELATIVE = /^\.{1,2}\//
export const MIME = /^(text|image|audio|video|application|multipart|font|model|message)\//i

/** a route a framework named itself, where the path may be one parameter or nothing */
export const soft = (text: string): boolean =>
  text.length < 300 &&
  !/[\s\\]/.test(text) &&
  !RELATIVE.test(text) &&
  !ASSET.test(text) &&
  // `@patch("app.module.thing")` is mock reaching into a module, not a route
  (text.includes("/") || !/\w\.\w/.test(text))

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

// the same holes, as the languages that interpolate with a dollar or a backslash write them
export const HOLES = /\$\{([^{}]*)\}|\{([^{}]*)\}|\$([A-Za-z_]\w*)|\\\(([^()]*)\)/g

// a name bound to one string, which is what a base url is usually held in
export const ASSIGN = marks(
  String.raw`([A-Za-z_$][\w$.]*)\s*(?::\s*[^=\n]+)?=\s*(?:new\s+URL\s*\(\s*)?§`,
)

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
