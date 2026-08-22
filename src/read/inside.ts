// owner: finn
// goal: one file read for the routes it serves and the calls it makes

import { scrubbed } from "./held.ts"
import { join } from "node:path"
import { build, type Graph } from "./graph.ts"
import { candidates, dialectOf } from "./dialects.ts"
import { MARK, breaks, lineAt } from "./specifiers.ts"
import { URL, normal, under, verbOf } from "./specs.ts"
import type { Client, Endpoint } from "./specs.ts"

export interface Action {
  name: string
  detail: boolean
  methods: string[]
  path: string
}

import {
  ASSIGN,
  CALLERS,
  CLASSY,
  CLIENTS,
  COMPILED,
  HOLDS,
  SERVERS,
  SERVES,
  filled,
  marks,
  pathy,
  soft,
} from "./rules.ts"
import {
  ACTION,
  BLUEPRINT,
  CONTROLLER,
  DETAIL,
  EXPORTED,
  GROUP,
  INCLUDE,
  INCLUDED,
  METHODS,
  MOUNTED,
  NESTS,
  PREFIX,
  REGISTER,
  ROUTERS,
  routed,
  wiring,
} from "./mounts.ts"
import type { Calls } from "./calls.ts"

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
  /** call sites shaped like a request whose path was not written at the call: a wrapper
   * took it from a constants file, and saying nothing about them reads as none existing */
  unread: number
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
  unread: 0,
})

/** the file declaring a name, or the nearest one when two files declare it alike */
export function nearest(held: string[] | undefined, from: string): string | undefined {
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

/** a file based router: the folders themselves are the path */

/** every endpoint and every call site in one repo, before the prefixes are applied */
export function collect(repo: string, graph: Graph = build(repo), calls?: Calls): Found {
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
    const { code, strings } = scrubbed(join(repo, path), dialect?.flavour ?? "js", true)
    if (!code) continue
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

    // a group is a prefix held in a name, so the routes hung on that name sit under it
    const grouped = new Map<string, string>()
    if (lang === "go")
      for (const m of code.matchAll(GROUP)) {
        const raw = said(m[2])
        if (pathy(raw)) grouped.set(m[1], raw)
      }
    // and rails nests by indentation, which is the one thing a line number cannot say
    const nests: { indent: number; at: number; path: string }[] = []
    if (lang === "ruby")
      for (const m of code.matchAll(NESTS))
        nests.push({ indent: m[1].length, at: m.index, path: m[2] })
    const nesting = (index: number) => {
      const line = code.slice(0, index).split("\n").pop() ?? ""
      const mine = /^[^\S\n]*/.exec(line)![0].length
      return nests
        .filter((one) => one.at < index && one.indent < mine)
        .map((one) => one.path)
        .join("/")
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

    // a span two rules both read is one thing: `@router.post("/x")` serves, and the wrapper
    // rule sees the same `.post(` and calls it a request. What served cannot also ask
    const served = new Set<number>()
    // and the call sites whose path this file never wrote down, counted once each
    const unread = new Set<number>()
    for (const rule of COMPILED) {
      if (!rule.langs.includes(lang)) continue
      if (rule.files && !rule.files.test(path)) continue
      if (rule.needs && !rule.needs.test(around.get(path) ?? "")) continue
      for (const m of code.matchAll(rule.exp)) {
        const groups = m.groups ?? {}
        const held = said(groups.p) || (groups.v ? (consts.get(groups.v) ?? "") : "")
        const after = code.slice(m.index + m[0].length, m.index + m[0].length + 120)
        const raw = filled(held && groups.p ? held + stretch(after, strings) : held, consts)
        if (!raw ? !rule.bare : !(rule.side === "server" ? soft(raw) : pathy(raw))) {
          // a call written like a request, holding a path this file never spells out
          if (rule.side !== "server" && !unread.has(m.index) && HOLDS.test(groups.who ?? "")) {
            unread.add(m.index)
            all.unread++
          }
          continue
        }
        if (rule.strict === "root" && !raw.startsWith("/") && !URL.test(raw)) continue
        if (rule.strict === "host" && !URL.test(raw)) continue
        const line = at(m.index)
        // a url beside a method and a body is a request, and beside a date it is a sitemap
        const around = code.slice(Math.max(0, m.index - 240), m.index + 240)
        if (rule.near && !rule.near.test(around)) continue
        let method = verbOf(groups.m || said(groups.q) || rule.method || "ANY")
        // spring puts the verb in an argument and jax-rs in the annotation above
        if (method === "ANY")
          method = verbOf(
            /RequestMethod\.(\w+)/.exec(around)?.[1] ||
              /@(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*(?:\n|$)/.exec(around)?.[1] ||
              sent(code, m.index, after, strings) ||
              "ANY",
          )
        const side =
          rule.side === "guess"
            ? guess(groups, raw, after, around, module.packages, lang)
            : rule.side
        if (!side) continue
        // a route only guessed at is a real one when it is written from the root:
        // `config.get("js/ts.implicitProjectConfig.checkJs")` is a settings lookup
        if (side === "server" && rule.side === "guess" && !raw.startsWith("/")) continue
        // a mount is not a route, and an annotation over a class is a prefix
        if (side === "server" && /^\s*,\s*include\s*\(/.test(after)) continue
        if (rule.onClass && CLASSY.test(after)) continue
        const { path: said_, host } = normal(raw || "/")
        // a channels router holds sockets, whatever verb the pattern that found it implies
        if (/websocket_urlpatterns/.test(code) && /^\/ws(\/|$)/.test(said_)) method = "WS"
        // a group it was hung on, and whatever it is nested inside
        const clean =
          side === "server"
            ? under(
                grouped.get((groups.who ?? "").replace(/[\s.]+$/, "")) ?? "",
                nesting(m.index),
                said_,
              )
            : said_
        if (side === "server") {
          const wants = METHODS.exec(after)
          const listed = wants
            ? [...wants[1].matchAll(marks("§"))].map((one) => verbOf(said(one[1])))
            : []
          // a runtime table writes the verb as the key of what answers on that path
          const keyed = method === "ANY" ? /^\s*(?::\s*\{)?([^}]*)\}/.exec(after) : null
          const keys = keyed
            ? [...keyed[1].matchAll(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*:/g)].map(
                (one) => one[1],
              )
            : []
          // both rules stop just past the path they read, so that offset is the one span
          served.add(m.index + m[0].length)
          for (const verb of listed.length ? listed : keys.length ? keys : [method])
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
          if (served.has(m.index + m[0].length)) continue
          all.clients.push({
            id: `${path}:${line}:${method}:${clean}`,
            file: path,
            line,
            method,
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

/** the verb the object around a path holds, whichever side of it that verb was written */
function sent(code: string, index: number, after: string, strings: string[]): string {
  // the object this path sits in, not the one before it
  const open = code.lastIndexOf("{", index)
  const from = Math.max(index - 240, open === -1 ? 0 : open)
  const before = [...code.slice(from, index).matchAll(SENT)].at(-1)
  const found = before ?? SENT.exec(after)
  SENT.lastIndex = 0
  return found ? (strings[Number(found[1])] ?? "") : ""
}

/** which side of the wire a shape belongs to, when the shape alone is both */
function guess(
  groups: Record<string, string | undefined>,
  raw: string,
  after: string,
  around: string,
  packages: string[],
  lang: string,
): "server" | "client" | "" {
  // an options object holding a handler is a route, and one holding a body is a call
  if (/\bhandler\s*:|\bpreHandler\s*:|\bschema\s*:\s*\{/.test(around) && !/\bbody\s*:/.test(around))
    return "server"
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
