// owner: finn
// goal: which function calls which

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { build, packageOf, type Graph } from "./graph.ts"
import { MARK, breaks, declared, foreign, lineAt, scrub, specifiers } from "./specifiers.ts"
import { dialectOf, keywordsOf, runtimeOf } from "./dialects.ts"
import { siting, type Symbol } from "./siting.ts"

export type { Symbol }

export interface Calls {
  symbols: Record<string, Symbol>
  /** what each repo in a folder came to on its own, when a folder was read as one */
  by?: Record<string, Calls["stats"]>
  /** resolved to nothing: a global, or dynamic. One row per name, not per call site */
  unresolved: { name: string; sites: number; from: string[] }[]
  stats: {
    files: number
    symbols: number
    functions: number
    classes: number
    components: number
    /** calls between symbols in this repo */
    edges: number
    external: number
    /** into what the runtime provides */
    builtin: number
    /** call sites we could place, and the ones we could not */
    coverage: number
    unresolved: number
    /** called by nothing here, which an entry point is */
    uncalled: number
    lines: number
  }
}

const KEYWORD = new Set([
  "if",
  "async",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "typeof",
  "await",
  "yield",
  "do",
  "function",
  "class",
  "new",
  "delete",
  "void",
  "in",
  "of",
  "instanceof",
  "import",
  "require",
  "super",
  "this",
  "constructor",
  "else",
  "try",
  "finally",
  "throw",
  "extends",
  "implements",
])

/** what runs on import */
export const TOP = "(top level)"

// it has to want a from, the way a specifier does
const BROUGHT = new RegExp(
  `(^|[\\s;})])(import|export)\\s+(type\\s+)?((?:(?!\\b(?:import|export)\\b)[^${MARK}])*?\\bfrom\\s*)?${MARK}\\d+${MARK}`,
  "g",
)

// the runtime holds these
const GLOBAL = new Set([
  "console",
  "Object",
  "Math",
  "JSON",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Promise",
  "Set",
  "Map",
  "WeakMap",
  "Date",
  "RegExp",
  "Error",
  "Symbol",
  "BigInt",
  "Proxy",
  "Reflect",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "structuredClone",
  "fetch",
  "URL",
  "URLSearchParams",
  "Blob",
  "File",
  "FormData",
  "Headers",
  "Request",
  "Response",
  "AbortController",
  "TextEncoder",
  "TextDecoder",
  "Buffer",
  "process",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "addEventListener",
  "removeEventListener",
  "getComputedStyle",
  "matchMedia",
  "alert",
  "confirm",
  "prompt",
  "localStorage",
  "sessionStorage",
  "document",
  "window",
  "navigator",
  "EventSource",
  "WebSocket",
  "Intl",
  "encodeURIComponent",
  "decodeURIComponent",
  "btoa",
  "atob",
  "scrollTo",
  "scrollBy",
  "Path2D",
  "XMLSerializer",
  "DOMParser",
  "ResizeObserver",
  "IntersectionObserver",
  "MutationObserver",
  "performance",
  "crypto",
  "history",
  "location",
  "Image",
])

const DECLARED =
  /(?<![.\w$])(export\s+)?(default\s+)?(async\s+)?(function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g
const ASSIGNED =
  /(?<![.\w$])(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=[^\S\n]*(async[^\S\n]+)?(?:function|(?:<[^<>=]*>[^\S\n]*)?\((?:[^()]|\([^()]*\))*\)[^\S\n]*(?::[^=\n]*)?=>|[A-Za-z_$][\w$]*[^\S\n]*=>)/g

// wrapped, not finished
const HANGING = /[=>?:,.+\-*/&|(\[]$/

/** an indented language ends a body where the indentation comes back to the head */
function block(code: string, from: number): number {
  const head = code.lastIndexOf("\n", from) + 1
  const deep = (line: string) => /^[^\S\n]*/.exec(line)![0].length
  const own = deep(code.slice(head, code.indexOf("\n", head) + 1 || undefined))
  let at = code.indexOf("\n", from)
  if (at === -1) return code.length
  while (at < code.length) {
    const next = code.indexOf("\n", at + 1)
    const line = code.slice(at + 1, next === -1 ? code.length : next)
    // a blank line belongs to whatever comes after it
    if (line.trim() && deep(line) <= own) return at
    if (next === -1) return code.length
    at = next
  }
  return code.length
}

/** the names a declaration binds: brackets matched, and every type annotation dropped,
 *  since an inline prop type holds signatures whose own parameters are not this one's */
function params(body: string): string {
  const open = body.indexOf("(")
  if (open === -1) return ""
  let depth = 0
  let end = -1
  for (let at = open; at < body.length && end === -1; at++) {
    if ("([{".includes(body[at])) depth++
    else if (")]}".includes(body[at]) && !--depth) end = at
  }
  if (end === -1) return ""
  let held = ""
  let deep = 0
  let typed = false
  for (const ch of body.slice(open + 1, end)) {
    if ("([{".includes(ch)) deep++
    else if (")]}".includes(ch)) deep--
    // a colon outside the brackets opens the type, and a comma closes it again
    if (ch === ":" && deep === 0) typed = true
    else if (ch === "," && deep === 0) typed = false
    if (!typed) held += ch
  }
  return held
}

/** the first brace past the parameters, matched. An arrow ends with its line */
function span(code: string, from: number): number {
  let depth = 0
  for (let at = from; at < code.length; at++) {
    const ch = code[at]
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (ch === "{" && depth === 0) {
      let braces = 0
      for (let end = at; end < code.length; end++) {
        if (code[end] === "{") braces++
        else if (code[end] === "}" && !--braces) return end + 1
      }
      return code.length
    } else if (ch === "\n" && depth === 0) {
      if (!HANGING.test(code.slice(0, at).trimEnd())) return at
    }
  }
  return code.length
}

export function calls(repo: string, graph: Graph = build(repo)): Calls {
  const symbols: Record<string, Symbol> = {}
  const bodies = new Map<string, [number, number]>()
  const mine = new Map<string, string[]>()
  // sets: includes() on a hub is quadratic
  const reaches = new Map<string, Set<string>>()
  const reached = new Map<string, Set<string>>()
  const link = (from: string, to: string) => {
    ;(reaches.get(from) ?? reaches.set(from, new Set()).get(from)!).add(to)
    ;(reached.get(to) ?? reached.set(to, new Set()).get(to)!).add(from)
  }
  // one row per name: a kernel leaves a million call sites unplaced and holds them all
  const unplaced = new Map<string, { sites: number; from: string[] }>()
  let unnamed = 0
  const lost = (from: string, name: string) => {
    unnamed++
    const held = unplaced.get(name) ?? { sites: 0, from: [] }
    held.sites++
    if (held.from.length < 4 && !held.from.includes(from)) held.from.push(from)
    unplaced.set(name, held)
  }
  let builtin = 0
  // the files that were readable, not what was in them: a kernel is a gigabyte of text
  const read_: string[] = []
  const reading = (path: string): string => {
    try {
      return scrub(readFileSync(join(repo, path), "utf8"), dialectOf(path)?.flavour).code
    } catch {
      return ""
    }
  }
  // file to local name, to where that name came from
  const bindings = new Map<
    string,
    Map<string, { file?: string; name: string; pkg?: string; type?: boolean }>
  >()
  // values it binds, like state setters
  const locals = new Map<string, Set<string>>()

  for (const module of Object.values(graph.modules)) {
    let text = ""
    try {
      text = readFileSync(join(repo, module.path), "utf8")
    } catch {
      continue
    }
    const dialect = dialectOf(module.path)
    const read = scrub(text, dialect?.flavour)
    const { code } = read
    read_.push(module.path)
    const starts = breaks(code)

    const local = new Map<string, { file?: string; name: string; pkg?: string; type?: boolean }>()
    // a language of its own says the name last: `import android.content.Intent` binds Intent
    if (dialect && dialect.id !== "ts")
      for (const spec of foreign(text, dialect, read)) {
        const file = module.imports[spec.text]
        const tail =
          spec.text
            .split(/[.:/]+/)
            .filter(Boolean)
            .pop() ?? ""
        if (!tail || tail === "*") continue
        if (file) local.set(tail, { file, name: tail })
        else if (!spec.guess) local.set(tail, { name: tail, pkg: outside(dialect.id, spec.text) })
      }
    for (const spec of dialect && dialect.id !== "ts" ? [] : specifiers(text, read)) {
      const file = module.imports[spec.text]
      const pkg = file ? undefined : packageOf(spec.text)
      for (const bound of spec.names)
        local.set(bound.local, { file, name: bound.name, pkg, type: spec.type })
    }
    bindings.set(module.path, local)

    // destructured names are the file's own
    const held = new Set<string>()
    for (const m of code.matchAll(/(?:const|let|var)\s*(?:\[([^\]]*)\]|\{([^}]*)\})\s*=/g))
      for (const part of (m[1] ?? m[2]).split(","))
        for (const name of part
          .split(":")
          .slice(-1)[0]
          .trim()
          .match(/^[A-Za-z_$][\w$]*/) ?? [])
          held.add(name)
    for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=:]/g)) held.add(m[1])
    locals.set(module.path, held)

    const add = (name: string, at: number, exported: boolean, kind: Symbol["kind"]) => {
      const id = `${module.path}#${name}`
      // `= class extends Base {` declares no name, and extends is not one
      if (symbols[id] || KEYWORD.has(name)) return
      // python and ruby write a body as an indent, and there is no brace to match
      const end = dialect?.flavour === "py" ? block(code, at) : span(code, at)
      bodies.set(id, [at, end])
      ;(mine.get(module.path) ?? mine.set(module.path, []).get(module.path)!).push(id)
      symbols[id] = {
        id,
        lang: module.lang,
        file: module.path,
        name,
        kind,
        line: lineAt(starts, at),
        lines: lineAt(starts, end) - lineAt(starts, at) + 1,
        exported,
        calls: [],
        callers: [],
        packages: [],
      }
    }

    if (dialect && dialect.id !== "ts") {
      // its own words for a declaration, and everything at the top of a file is reachable
      for (const one of declared(code, dialect))
        add(one.name, one.at, true, one.kind === "class" ? "class" : "function")
    } else {
      for (const m of code.matchAll(DECLARED))
        add(
          m[5],
          m.index,
          !!m[1],
          m[4] === "class" ? "class" : /^[A-Z]/.test(m[5]) ? "component" : "function",
        )
      for (const m of code.matchAll(ASSIGNED))
        add(m[2], m.index, !!m[1], /^[A-Z]/.test(m[2]) ? "component" : "function")
    }
  }

  // on the jvm, an import naming no file is looked up by declaration
  const declares = new Map<string, string[]>()
  for (const [id] of Object.entries(symbols)) {
    const name = id.split("#")[1]
    declares.set(name, [...(declares.get(name) ?? []), id.split("#")[0]])
  }
  for (const module of Object.values(graph.modules)) {
    if (!module.lang || module.lang === "ts") continue
    const local = bindings.get(module.path)
    if (!local) continue
    for (const [name, came] of local) {
      if (came.file || !came.pkg) continue
      const held = declares.get(name)
      // one file declaring it is an answer, several is a guess nobody asked for
      if (held?.length === 1 && held[0] !== module.path) local.set(name, { file: held[0], name })
    }
  }

  // for a language that imports a module rather than its names
  for (const module of Object.values(graph.modules)) {
    if (!module.lang || module.lang === "ts") continue
    const local = bindings.get(module.path)
    if (!local) continue
    for (const edge of module.out)
      for (const id of mine.get(edge.to) ?? []) {
        const name = id.split("#")[1]
        if (!local.has(name)) local.set(name, { file: edge.to, name })
      }
  }

  for (const file of read_) {
    // read again rather than held: every file's text at once is most of the memory
    const code = reading(file)
    // what is left when every body is taken out runs on import, or an entry point reads as dead
    const spans = (mine.get(file) ?? []).map((id) => bodies.get(id)!).sort((a, b) => a[0] - b[0])
    let outside = ""
    let at = 0
    for (const [from, to] of spans) {
      if (from > at) outside += code.slice(at, from)
      at = Math.max(at, to)
    }
    outside += code.slice(at)
    // an import names a thing without calling it, so the statements themselves go
    const top_ = outside.trim() ? outside.replace(BROUGHT, " ") : ""
    // its own language owns its own words: a `when` is not a call to something missing
    const lang = graph.modules[file]?.lang ?? ""
    const owns = lang && lang !== "ts" ? keywordsOf(lang) : KEYWORD
    const runtime = lang && lang !== "ts" ? runtimeOf(lang) : GLOBAL
    const walking = [...(mine.get(file) ?? []), `${file}#${TOP}`]
    for (const id of walking) {
      const top = id.endsWith(`#${TOP}`)
      if (top && !top_) continue
      const symbol =
        symbols[id] ??
        (symbols[id] = {
          id,
          lang: graph.modules[file]?.lang ?? "",
          file,
          name: TOP,
          kind: "module",
          line: 1,
          lines: 0,
          exported: false,
          calls: [],
          callers: [],
          packages: [],
        })
      const [from, to] = top ? [0, 0] : bodies.get(id)!
      const body = top ? top_ : code.slice(from, to)
      // defaults stripped: `isEqual = defaultIsEqual` declares one and reaches the other
      const takes = new Set(
        params(body)
          .replace(/=[^,]*/g, "")
          .match(/[A-Za-z_$][\w$]*/g) ?? [],
      )

      builtin += siting(symbol, body, {
        file,
        lang,
        top,
        owns,
        runtime,
        symbols,
        declares,
        bindings,
        locals,
        takes,
        link,
        lost,
      })
    }
  }

  // what each pass held is dropped as the next one takes it over, since on a kernel every
  // one of these is hundreds of megabytes and holding two copies at once is what runs out
  bodies.clear()
  bindings.clear()
  locals.clear()
  mine.clear()
  declares.clear()
  for (const symbol of Object.values(symbols)) {
    const out = reaches.get(symbol.id)
    if (out) {
      symbol.calls = [...out]
      reaches.delete(symbol.id)
    }
    const into = reached.get(symbol.id)
    if (into) {
      symbol.callers = [...into]
      reached.delete(symbol.id)
    }
  }

  const unresolved = [...unplaced]
    .map(([name, one]) => ({ name, sites: one.sites, from: one.from }))
    .sort((a, b) => b.sites - a.sites)
  unplaced.clear()

  const all = Object.values(symbols)
  const edges = all.reduce((sum, s) => sum + s.calls.length, 0)
  const external = all.reduce((sum, s) => sum + s.packages.length, 0)
  const placed = edges + external + builtin
  return {
    symbols,
    unresolved,
    stats: {
      files: read_.length,
      symbols: all.length,
      functions: all.filter((s) => s.kind === "function").length,
      classes: all.filter((s) => s.kind === "class").length,
      components: all.filter((s) => s.kind === "component").length,
      edges,
      external,
      builtin,
      coverage: placed + unnamed ? placed / (placed + unnamed) : 1,
      unresolved: unnamed,
      uncalled: all.filter((s) => !s.callers.length).length,
      lines: all.reduce((sum, s) => sum + s.lines, 0),
    },
  }
}

/** the package a foreign specifier belongs to, for a name it brought in from outside */
const outside = (lang: string, text: string): string =>
  lang === "rust"
    ? text.split("::")[0]
    : lang === "jvm" || lang === "python"
      ? text.split(".").slice(0, 2).join(".")
      : (text.split("/").pop() ?? text)
