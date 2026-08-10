// owner: finn
// goal: which function calls which

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { build, type Graph } from "./graph.ts"
import { packageOf } from "./graph.ts"
import { MARK, scrub, specifiers } from "./specifiers.ts"

export interface Symbol {
  /** file#name, unique: a file declares a name once */
  id: string
  file: string
  name: string
  kind: "function" | "class" | "component"
  line: number
  /** lines its body spans */
  lines: number
  exported: boolean
  /** what it reaches, and what reaches it */
  calls: string[]
  callers: string[]
  /** packages it calls into */
  packages: string[]
}

export interface Calls {
  symbols: Record<string, Symbol>
  /** resolved to nothing: a global, or dynamic */
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
    /** into what the runtime provides */
    builtin: number
    /** call sites we could place */
    coverage: number
    /** called by nothing here, which an entry point is */
    uncalled: number
    lines: number
  }
}

// onClick={save} calls save. a dot owns the name, a spread does not
const USED = /(?<![\w$])(?<!(?<!\.)\.)([A-Za-z_$][\w$]*)/g
const CALLED = /^[^\S\n]*(?:<[^<>()]*>)?[^\S\n]*\(/
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

/** what runs on import */
export const TOP = "(top level)"

// an import, up to the scrub's marker
const BROUGHT = new RegExp(`(^|[\\s;}])(import|export)\\s+[^${MARK}]*?${MARK}\\d+${MARK}`, "g")

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
])

const DECLARED =
  /(?<![.\w$])(export\s+)?(default\s+)?(async\s+)?(function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g
const ASSIGNED =
  /(?<![.\w$])(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=[^\S\n]*(async[^\S\n]+)?(?:function|\([^)]*\)[^\S\n]*(?::[^=\n]*)?=>|[A-Za-z_$][\w$]*[^\S\n]*=>)/g

// wrapped, not finished
const HANGING = /[=>?:,.+\-*/&|(\[]$/

/** the first brace outside the parameter list, matched. An arrow ends with its line */
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
  const bodies = new Map<string, [number, number]>()
  const mine = new Map<string, string[]>()
  const tops = new Map<string, string>()
  // sets: includes() on a hub is quadratic
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
  // values it binds, like state setters
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

  // or every entry point reads as dead
  for (const [file, code] of sources) {
    const spans = (mine.get(file) ?? []).map((id) => bodies.get(id)!).sort((a, b) => a[0] - b[0])
    let outside = ""
    let at = 0
    for (const [from, to] of spans) {
      if (from > at) outside += code.slice(at, from)
      at = Math.max(at, to)
    }
    outside += code.slice(at)
    // an import names a thing without calling it, so the statements themselves go
    if (outside.trim()) tops.set(file, outside.replace(BROUGHT, " "))
  }

  for (const [file, code] of sources) {
    const local = bindings.get(file)!
    const walking = [...(mine.get(file) ?? []), `${file}#${TOP}`]
    for (const id of walking) {
      const top = id.endsWith(`#${TOP}`)
      if (top && !tops.has(file)) continue
      const symbol =
        symbols[id] ??
        (symbols[id] = {
          id,
          file,
          name: TOP,
          kind: "function",
          line: 1,
          lines: 0,
          exported: false,
          calls: [],
          callers: [],
          packages: [],
        })
      const [from, to] = top ? [0, 0] : bodies.get(id)!
      const body = top ? tops.get(file)! : code.slice(from, to)
      const takes = new Set((body.match(/\(([^)]*)\)/)?.[1] ?? "").match(/[A-Za-z_$][\w$]*/g) ?? [])

      const seen = new Set<string>()
      for (const m of body.matchAll(USED)) {
        const name = m[1]
        // coverage counts call shaped mentions only
        const shaped = CALLED.test(body.slice(m.index + name.length, m.index + name.length + 40))
        if (KEYWORD.has(name) || seen.has(name)) continue
        seen.add(name)
        if (name === symbol.name) continue

        const here = symbols[`${file}#${name}`]
        if (here) {
          link(symbol.id, here.id)
          continue
        }
        if (takes.has(name) || locals.get(file)?.has(name)) continue
        if (GLOBAL.has(name)) {
          if (shaped) builtin++
          continue
        }
        const came = local.get(name)
        // written, not called
        if (came?.type) continue
        if (came?.pkg) {
          if (!symbol.packages.includes(came.pkg)) symbol.packages.push(came.pkg)
          continue
        }
        if (came?.file) {
          const wanted = came.name === "default" || came.name === "*" ? name : came.name
          // a re-export is a doorway
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
        if (shaped) unresolved.push({ from: symbol.id, name })
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
