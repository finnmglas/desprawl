// owner: finn
// goal: which function calls which, resolved through the import graph

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { build, type Graph } from "./graph.ts"
import { packageOf } from "./graph.ts"
import { scrub, specifiers } from "./specifiers.ts"

export interface Symbol {
  /** file#name, which is unique because a file cannot declare a name twice */
  id: string
  file: string
  name: string
  kind: "function" | "class" | "component"
  line: number
  /** lines its body spans, so size is measured rather than guessed */
  lines: number
  exported: boolean
  /** ids it reaches, and the ones that reach it */
  calls: string[]
  callers: string[]
  /** packages it calls into, by the name that would be installed */
  packages: string[]
}

export interface Calls {
  symbols: Record<string, Symbol>
  /** a name called that resolved to nothing here: a builtin, a global, or dynamic */
  unresolved: { from: string; name: string }[]
  stats: {
    files: number
    symbols: number
    functions: number
    classes: number
    components: number
    /** calls between symbols in this repo */
    edges: number
    external: number
    /** calls into what the runtime provides, which is placed but not ours */
    builtin: number
    /** share of call sites that named something we could place */
    coverage: number
    /** declared here and called by nothing here, which for an entry point is normal */
    uncalled: number
    lines: number
  }
}

// a name followed by a bracket, unless something owns it: obj.method() is not method()
const CALL = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*\(/g
// a react component is called by being written, and that is most calls in a ui repo
const USED = /<([A-Z][\w$]*)/g
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
])

// declared by the runtime, so calling one is resolved even though nothing here holds it
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
])

const DECLARED =
  /(?<![.\w$])(export\s+)?(default\s+)?(async\s+)?(function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g
const ASSIGNED =
  /(?<![.\w$])(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(async\s+)?(?:function|\([^)]*\)\s*(?::[^=\n]*)?=>|[A-Za-z_$][\w$]*\s*=>)/g

// a line that ends on one of these is not finished, it is wrapped
const HANGING = /[=>?:,.+\-*/&|(\[]$/

/**
 * How far a declaration reaches. Brackets are counted on the scrubbed code, where
 * strings and templates are already gone, so a brace inside one cannot mislead. The
 * body is the first brace outside the parameter list; an arrow that returns an
 * expression has none, and ends where its statement stops wrapping.
 */
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

/** where every line starts, counted once per file rather than once per declaration */
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

export function calls(repo: string, graph: Graph = build(repo)): Calls {
  const symbols: Record<string, Symbol> = {}
  // where each declaration starts and ends, kept so the body is read once, not found twice
  const bodies = new Map<string, [number, number]>()
  const mine = new Map<string, string[]>()
  // sets while building, since a hub with a thousand callers turns includes() quadratic
  const reaches = new Map<string, Set<string>>()
  const reached = new Map<string, Set<string>>()
  const link = (from: string, to: string) => {
    ;(reaches.get(from) ?? reaches.set(from, new Set()).get(from)!).add(to)
    ;(reached.get(to) ?? reached.set(to, new Set()).get(to)!).add(from)
  }
  const unresolved: { from: string; name: string }[] = []
  let builtin = 0
  const sources = new Map<string, string>()
  // file to local name, to where that name came from
  const bindings = new Map<
    string,
    Map<string, { file?: string; name: string; pkg?: string; type?: boolean }>
  >()
  // names bound inside a file that are values, not declarations: state setters and the like
  const locals = new Map<string, Set<string>>()

  for (const module of Object.values(graph.modules)) {
    let text = ""
    try {
      text = readFileSync(join(repo, module.path), "utf8")
    } catch {
      continue
    }
    const read = scrub(text)
    const { code } = read
    sources.set(module.path, code)
    const starts = breaks(code)

    const local = new Map<string, { file?: string; name: string; pkg?: string; type?: boolean }>()
    for (const spec of specifiers(text, read)) {
      const file = module.imports[spec.text]
      const pkg = file ? undefined : packageOf(spec.text)
      for (const bound of spec.names)
        local.set(bound.local, { file, name: bound.name, pkg, type: spec.type })
    }
    bindings.set(module.path, local)

    // what a destructure binds is a value the file already holds, not a call going out
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
      if (symbols[id]) return
      const end = span(code, at)
      bodies.set(id, [at, end])
      ;(mine.get(module.path) ?? mine.set(module.path, []).get(module.path)!).push(id)
      symbols[id] = {
        id,
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

  // second pass, since a call can name something declared in a file read later
  for (const [file, code] of sources) {
    const local = bindings.get(file)!
    for (const id of mine.get(file) ?? []) {
      const symbol = symbols[id]
      const [from, to] = bodies.get(id)!
      const body = code.slice(from, to)

      const seen = new Set<string>()
      for (const m of [...body.matchAll(CALL), ...body.matchAll(USED)]) {
        const name = m[1]
        if (KEYWORD.has(name) || seen.has(name)) continue
        seen.add(name)
        if (name === symbol.name) continue

        const here = symbols[`${file}#${name}`]
        if (here) {
          link(symbol.id, here.id)
          continue
        }
        if (locals.get(file)?.has(name)) continue
        if (GLOBAL.has(name)) {
          builtin++
          continue
        }
        const came = local.get(name)
        // a type is not called, it is written down, and the build erases it
        if (came?.type) continue
        if (came?.pkg) {
          if (!symbol.packages.includes(came.pkg)) symbol.packages.push(came.pkg)
          continue
        }
        if (came?.file) {
          const wanted = came.name === "default" || came.name === "*" ? name : came.name
          // a file that only passes a name along is a doorway, so keep walking through it
          let at = came.file
          let called = wanted
          let target = symbols[`${at}#${called}`] ?? symbols[`${at}#${name}`]
          for (let hop = 0; !target && hop < 4; hop++) {
            const onward = bindings.get(at)?.get(called)
            if (!onward?.file) break
            called = onward.name === "default" || onward.name === "*" ? called : onward.name
            at = onward.file
            target = symbols[`${at}#${called}`]
          }
          if (target) {
            link(symbol.id, target.id)
            continue
          }
        }
        unresolved.push({ from: symbol.id, name })
      }
    }
  }

  for (const symbol of Object.values(symbols)) {
    symbol.calls = [...(reaches.get(symbol.id) ?? [])]
    symbol.callers = [...(reached.get(symbol.id) ?? [])]
  }

  const all = Object.values(symbols)
  const edges = all.reduce((sum, s) => sum + s.calls.length, 0)
  const external = all.reduce((sum, s) => sum + s.packages.length, 0)
  const placed = edges + external + builtin
  return {
    symbols,
    unresolved,
    stats: {
      files: sources.size,
      symbols: all.length,
      functions: all.filter((s) => s.kind === "function").length,
      classes: all.filter((s) => s.kind === "class").length,
      components: all.filter((s) => s.kind === "component").length,
      edges,
      external,
      builtin,
      coverage: placed + unresolved.length ? placed / (placed + unresolved.length) : 1,
      uncalled: all.filter((s) => !s.callers.length).length,
      lines: all.reduce((sum, s) => sum + s.lines, 0),
    },
  }
}
