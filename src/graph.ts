// owner: finn
// goal: which file imports which, resolved not guessed

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { git } from "./model.ts"
import { specifiers, symbols, type Symbols } from "./specifiers.ts"

export interface Edge {
  to: string
  type: boolean
  lazy: boolean
}

export interface Module {
  path: string
  out: Edge[] // resolved inside the repo
  in: string[]
  packages: string[] // by install name
  /** what it declares, which is a truer size than its line count */
  symbols: Symbols
  lines: number
}

export interface Missing {
  from: string
  specifier: string
  reason: "no such file" | "outside the repo"
}

export interface Graph {
  modules: Record<string, Module>
  packages: Record<string, string[]> // package to its importers
  missing: Missing[]
  stats: {
    files: number
    edges: number
    external: number
    generated: number // on disk, untracked
    assets: number // css, json: edges but not modules
    coverage: number // share of specifiers resolved
  }
}

const SOURCE = /\.(m|c)?(t|j)sx?$/
const VENDORED =
  /(^|\/)(node_modules|bower_components|jspm_packages|web_modules|vendor|third_party|\.yarn|dist|build|out|coverage|\.next|\.nuxt|\.output)\//

// the order typescript probes in
const TRIES = [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"]
const REWRITE: [RegExp, string[]][] = [
  [/\.js$/, [".ts", ".tsx", ".d.ts", ".js"]],
  [/\.jsx$/, [".tsx", ".jsx"]],
  [/\.mjs$/, [".mts", ".d.mts", ".mjs"]],
  [/\.cjs$/, [".cts", ".d.cts", ".cjs"]],
]

// output, not source
const BUNDLED = /(\.min\.[cm]?jsx?$)|(\.[0-9a-f]{8,}\.[cm]?jsx?$)|(^|\/)[\w.-]*-build\//

// bundler runtime, left at the top of its own output
const RUNTIME = /parcelRequire|webpackJsonp|__webpack_require__|System\.register|sourceMappingURL=/

/** a bundle's requires are ids inside itself, not paths */
function bundled(file: string): boolean {
  try {
    const head = readFileSync(file, "utf8").slice(0, 4096)
    if (RUNTIME.test(head)) return true
    const lines = head.split("\n")
    return lines.length > 1 && head.length / lines.length > 300
  } catch {
    return false
  }
}

/** json with comments. A regex cannot do it: `"@/*": ["./*"]` opens a block comment */
export function jsonc(text: string): unknown {
  let out = ""
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      let at = i + 1
      while (at < text.length && text[at] !== '"') at += text[at] === "\\" ? 2 : 1
      out += text.slice(i, at + 1)
      i = at + 1
    } else if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i)
      i = end === -1 ? text.length : end
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end === -1 ? text.length : end + 2
    } else {
      out += ch
      i++
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
  } catch {
    return null
  }
}

function config(path: string): Record<string, any> | null {
  try {
    return jsonc(readFileSync(path, "utf8")) as Record<string, any> | null
  } catch {
    return null
  }
}

/** nearest config to a file, extends followed */
function options(repo: string, dir: string, cache: Map<string, any>): any {
  if (cache.has(dir)) return cache.get(dir)
  let at = dir
  let found: any = null
  while (at.startsWith(repo)) {
    for (const name of ["tsconfig.json", "jsconfig.json"]) {
      const path = join(at, name)
      if (!existsSync(path)) continue
      found = merged(path, new Set())
      break
    }
    if (found) break
    const up = dirname(at)
    if (up === at) break
    at = up
  }
  const answer = { dir: found?.dir ?? repo, paths: found?.paths ?? {}, baseUrl: found?.baseUrl }
  cache.set(dir, answer)
  return answer
}

function merged(path: string, seen: Set<string>): any {
  if (seen.has(path)) return null
  seen.add(path)
  const raw = config(path)
  if (!raw) return null
  const dir = dirname(path)
  const own = raw.compilerOptions ?? {}
  const base = raw.extends
    ? merged(
        raw.extends.startsWith(".")
          ? resolve(dir, raw.extends.endsWith(".json") ? raw.extends : `${raw.extends}.json`)
          : join(dir, "node_modules", raw.extends),
        seen,
      )
    : null
  return {
    dir: own.paths || own.baseUrl ? dir : (base?.dir ?? dir),
    paths: { ...(base?.paths ?? {}), ...(own.paths ?? {}) },
    baseUrl: own.baseUrl ?? base?.baseUrl,
  }
}

/** the file actually on disk, after the extension dance */
function onDisk(candidate: string): string | null {
  const rewrite = REWRITE.find(([match]) => match.test(candidate))
  if (rewrite) {
    for (const ext of rewrite[1]) {
      const swapped = candidate.replace(rewrite[0], ext)
      if (existsSync(swapped) && statSync(swapped).isFile()) return swapped
    }
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  for (const ext of TRIES) if (existsSync(candidate + ext)) return candidate + ext
  for (const ext of TRIES) {
    const index = join(candidate, `index${ext}`)
    if (existsSync(index)) return index
  }
  return null
}

/** the package a bare specifier installs as */
export function packageOf(specifier: string): string {
  if (specifier.startsWith("node:")) return specifier
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

export function build(repo: string): Graph {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const tracked = new Set(
    git(root, "ls-files", "-z")
      .split("\0")
      .filter((p) => p && !VENDORED.test(p)),
  )
  // a bundle is output, never a module of its own
  const sources = [...tracked].filter(
    (p) => SOURCE.test(p) && !p.endsWith(".d.ts") && !BUNDLED.test(p) && !bundled(join(root, p)),
  )

  // resolves to its own folder, not node_modules
  const workspaces = new Map<string, string>()
  for (const path of tracked) {
    if (!/(^|\/)package\.json$/.test(path)) continue
    const name = config(join(root, path))?.name
    if (typeof name === "string" && name) workspaces.set(name, dirname(path))
  }

  const modules: Record<string, Module> = Object.fromEntries(
    sources.map((path) => [
      path,
      {
        path,
        out: [],
        in: [],
        packages: [],
        symbols: { exports: 0, functions: 0, classes: 0 },
        lines: 0,
      },
    ]),
  )
  const packages: Record<string, string[]> = {}
  const missing: Missing[] = []
  const configs = new Map<string, any>()
  let external = 0
  let assets = 0
  let generated = 0
  let seen = 0

  for (const from of sources) {
    const full = join(root, from)
    let source = ""
    try {
      source = readFileSync(full, "utf8")
    } catch {
      continue
    }

    modules[from].symbols = symbols(source)
    modules[from].lines = source.split("\n").length
    for (const spec of specifiers(source)) {
      seen++
      const target = locate(spec.text, full)
      if (!target) continue

      if (target.kind === "package") {
        external++
        add(modules[from].packages, target.name)
        ;(packages[target.name] ??= []).push(from)
        continue
      }
      if (target.kind === "asset") {
        assets++
        continue
      }
      if (target.kind === "generated") {
        generated++
        continue
      }
      if (target.kind === "missing") {
        missing.push({ from, specifier: spec.text, reason: target.reason })
        continue
      }
      modules[from].out.push({ to: target.path, type: spec.type, lazy: spec.lazy })
      modules[target.path].in.push(from)
    }
  }

  function locate(
    text: string,
    importer: string,
  ):
    | { kind: "file"; path: string }
    | { kind: "asset" }
    | { kind: "generated" }
    | { kind: "package"; name: string }
    | { kind: "missing"; reason: Missing["reason"] } {
    if (text.startsWith(".")) return inside(join(dirname(importer), text), text)

    if (text.startsWith("/") || /^[A-Za-z]:[\\/]/.test(text))
      return { kind: "missing", reason: "outside the repo" }

    const conf = options(root, dirname(importer), configs)
    // an alias is internal, so a miss is a miss: calling it a package fakes coverage
    let aliased = false
    for (const [pattern, targets] of Object.entries(conf.paths) as [string, string[]][]) {
      const star = pattern.indexOf("*")
      const head = star === -1 ? pattern : pattern.slice(0, star)
      const tail = star === -1 ? "" : pattern.slice(star + 1)
      if (!text.startsWith(head) || !text.endsWith(tail)) continue
      const middle = star === -1 ? "" : text.slice(head.length, text.length - tail.length)
      aliased = true
      for (const target of targets) {
        const base = join(conf.dir, conf.baseUrl ?? ".", target.replace("*", middle))
        const hit = inside(base, text)
        if (hit.kind !== "missing") return hit
      }
    }

    const name = packageOf(text)
    const home = workspaces.get(name)
    if (home) {
      const rest = text.slice(name.length)
      const hit = inside(join(root, home, rest || "."), text)
      if (hit.kind === "file") return hit
      const main = config(join(root, home, "package.json"))
      const entry = main?.main ?? main?.module ?? main?.exports?.["."]?.default
      if (typeof entry === "string") {
        const viaEntry = inside(join(root, home, entry), text)
        if (viaEntry.kind === "file") return viaEntry
      }
    }

    if (conf.baseUrl) {
      const hit = inside(join(conf.dir, conf.baseUrl, text), text)
      if (hit.kind !== "missing") return hit
    }
    if (aliased) return { kind: "missing", reason: "no such file" }
    return { kind: "package", name }
  }

  function inside(
    candidate: string,
    _text: string,
  ):
    | { kind: "file"; path: string }
    | { kind: "asset" }
    | { kind: "generated" }
    | { kind: "missing"; reason: Missing["reason"] } {
    const hit = onDisk(candidate)
    if (!hit) return { kind: "missing", reason: "no such file" }
    const rel = relative(root, hit)
    if (rel.startsWith("..")) return { kind: "missing", reason: "outside the repo" }
    if (modules[rel]) return { kind: "file", path: rel }
    // there, just not a module: a stylesheet, or code git never sees
    return tracked.has(rel) ? { kind: "asset" } : { kind: "generated" }
  }

  const edges = Object.values(modules).reduce((sum, m) => sum + m.out.length, 0)
  return {
    modules,
    packages,
    missing,
    stats: {
      files: sources.length,
      edges,
      external,
      generated,
      assets,
      coverage: seen ? (seen - missing.length) / seen : 1,
    },
  }
}

const add = (list: string[], value: string) => {
  if (!list.includes(value)) list.push(value)
}
