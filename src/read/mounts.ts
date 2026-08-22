// owner: finn
// goal: where a route is mounted: the folders themselves, or whatever the app was handed

import { reading } from "./held.ts"
import { join } from "node:path"
import { foreign, specifiers } from "./specifiers.ts"
import { dialectOf } from "./dialects.ts"
import { marks } from "./rules.ts"
import { under } from "./specs.ts"
import type { Graph } from "./graph.ts"

export function routed(path: string): { path: string; framework: string } | null {
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
export const EXPORTED =
  /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g

export const MOUNTED = marks(
  String.raw`\.(?:use|mount|register)\s*\(\s*§p\s*,\s*(?<who>[A-Za-z_$][\w$.]*)`,
)
export const INCLUDED = marks(
  String.raw`include_router\s*\(\s*([A-Za-z_][\w.]*)\s*(?:,\s*prefix\s*=\s*§)?`,
)
export const BLUEPRINT = marks(
  String.raw`register_blueprint\s*\(\s*([A-Za-z_][\w.]*)\s*(?:,\s*url_prefix\s*=\s*§)?`,
)
// the same annotation names a prefix on a class and a route on a method, in four languages
export const CONTROLLER = marks(
  String.raw`[#@\[]\s*\[?(?:Controller|RestController|RequestMapping|ApiController|Path|Route)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?§`,
)
// the whole word, or `sort_prefix = "-"` reads as one
export const PREFIX = marks(
  String.raw`\b(?:prefix|url_prefix|basePath|base_url|baseURL)\s*[=:(]\s*§`,
)
// go and gin hold a prefix in whatever the group was assigned to
export const GROUP = marks(String.raw`([A-Za-z_]\w*)\s*:?=\s*[\w.]+\.(?:Group|Party)\s*\(\s*§`)
// rails nests with a word and an indent, and closes with an end no regex can see
export const NESTS = /^([^\S\n]*)(?:namespace|scope)\s+[:"']([\w/-]+)/gm
export const INCLUDE = marks(
  String.raw`(?:path|re_path|url)\s*\(\s*§\s*,\s*include\s*\(\s*(?:\(\s*)?(?:§|([A-Za-z_][\w.]*))`,
)
export const REGISTER = marks(
  String.raw`([A-Za-z_]\w*)\s*\.\s*register\s*\(\s*§\s*,\s*([A-Za-z_]\w*)`,
)
export const ROUTERS = marks(String.raw`include\s*\(\s*([A-Za-z_]\w*)\s*\.\s*urls\s*\)`)
export const ACTION =
  /@action\s*\(((?:[^()]|\([^()]*\))*)\)\s*\n(?:\s*@[^\n]*\n)*\s*(?:async\s+)?def\s+(\w+)/g
export const METHODS = /methods\s*=\s*[[({]([^\])}]*)/
export const DETAIL = /detail\s*=\s*(True|true|False|false)/

/** every name a file binds, and the file it came from, so a mount can be followed */
export function wiring(repo: string, graph: Graph): Map<string, Map<string, string>> {
  const all = new Map<string, Map<string, string>>()
  for (const module of Object.values(graph.modules)) {
    const local = new Map<string, string>()
    const text = reading(join(repo, module.path))
    if (!text) continue
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
