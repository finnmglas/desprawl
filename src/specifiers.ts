// owner: finn
// goal: every module a file asks for, and nothing a string pretends to

export interface Specifier {
  text: string // what stood between the quotes
  type: boolean // erased at build time, so a weaker edge
  lazy: boolean // import(), a chunk boundary too
  via: boolean // `export ... from`, so this file forwards rather than uses
  /** the names it binds locally, and what each is called where it came from */
  names: { local: string; name: string }[]
  /** one of several readings of one statement, so landing nowhere says nothing */
  guess?: boolean
}

/** the names it binds, and what each came in as */
export function bound(clause: string): { local: string; name: string }[] {
  const out: { local: string; name: string }[] = []
  const text = clause.replace(/\bfrom\s*$/, "").trim()
  const listed = text.match(/\{([^}]*)\}/)
  for (const part of listed?.[1].split(",") ?? []) {
    const [name, local] = part
      .trim()
      .replace(/^type\s+/, "")
      .split(/\s+as\s+/)
    if (name) out.push({ local: (local ?? name).trim(), name: name.trim() })
  }
  const star = text.match(/\*\s+as\s+([\w$]+)/)
  if (star) out.push({ local: star[1], name: "*" })
  const head = text
    .replace(/\{[^}]*\}/, "")
    .replace(/\*\s+as\s+[\w$]+/, "")
    .split(",")[0]
    .trim()
  if (/^[A-Za-z_$][\w$]*$/.test(head)) out.push({ local: head, name: "default" })
  return out
}

/** `import { type A, type B }` is erased just as `import type { A, B }` is */
export function erased(clause: string): boolean {
  const listed = clause
    .replace(/\bfrom\s*$/, "")
    .trim()
    .match(/^\{([^}]*)\}$/)
  const parts = listed?.[1].split(",").filter((part) => part.trim()) ?? []
  return parts.length > 0 && parts.every((part) => /^\s*type\s/.test(part))
}

import type { Dialect, Flavour } from "./dialects.ts"

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length

const WORD = /[A-Za-z0-9_$]/
export const MARK = ""
const MARKED = new RegExp(`${MARK}(\\d+)${MARK}`, "g")

/** comments and regex become spaces, strings a marker pointing at their text */
export function scrub(
  source: string,
  flavour: Flavour = "js",
): { code: string; strings: string[] } {
  const strings: string[] = []
  let code = ""
  let i = 0
  // only javascript has a regex literal, and only python hashes a comment. Everything else
  // is c shaped: two slashes, a block, and quotes
  const js = flavour === "js"
  const py = flavour === "py"
  // rust nests its block comments, c and the jvm close on the first */
  const nests = flavour === "rs"

  // after a value a slash divides, otherwise it opens a regex
  const divides = (): boolean => {
    for (let back = code.length - 1; back >= 0; back--) {
      const ch = code[back]
      if (/\s/.test(ch)) continue
      // `</div>` closes a tag and `{on} />` ends one, and tsx is full of both. A marker is a
      // string that was already read: `<Icon className="x" />` ends with one, and so does
      // plain division by a string, so a slash after it never opens a regex either
      return WORD.test(ch) || ch === ")" || ch === "]" || ch === "<" || ch === "}" || ch === MARK
    }
    return false
  }

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (py && ch === "#") {
      const end = source.indexOf("\n", i)
      i = end === -1 ? source.length : end
    } else if (py && /^[fF][rRbB]?["']/.test(source.slice(i)) && !WORD.test(code.at(-1) ?? " ")) {
      // an f-string is code between braces, and `f"{go()}"` calls go
      const quote = /^[fF][rRbB]?(["'])/.exec(source.slice(i))![1]
      const triple =
        source.slice(i).includes(quote.repeat(3), 0) && /^[fF][rRbB]?["']{3}/.test(source.slice(i))
      const fence = triple ? quote.repeat(3) : quote
      let at = i + /^[fF][rRbB]?/.exec(source.slice(i))![0].length + fence.length
      let held = ""
      while (at < source.length && source.slice(at, at + fence.length) !== fence) {
        if (source[at] === "\\") at += 2
        else if (source[at] === "{" && source[at + 1] !== "{") {
          let depth = 1
          const from = ++at
          while (at < source.length && depth) {
            if (source[at] === "{") depth++
            else if (source[at] === "}") depth--
            if (depth) at++
          }
          held += ` ${source.slice(from, at)} `
          at++
        } else at++
      }
      const inner = scrub(held, "py")
      strings.push("")
      const base = strings.length
      strings.push(...inner.strings)
      const kept = inner.code
        .replace(MARKED, (_, n) => `${MARK}${Number(n) + base}${MARK}`)
        .replace(/\n/g, " ")
      code += `${MARK}${base - 1}${MARK}${kept}${"\n".repeat(count(source.slice(i, at), /\n/g))}`
      i = at + fence.length
    } else if (py && (ch === '"' || ch === "'") && source.slice(i, i + 3) === ch.repeat(3)) {
      const fence = ch.repeat(3)
      const end = source.indexOf(fence, i + 3)
      const held = source.slice(i + 3, end === -1 ? source.length : end)
      strings.push(held)
      // a docstring spans lines, and every one of them has to survive it
      code += `${MARK}${strings.length - 1}${MARK}${"\n".repeat(count(held, /\n/g))}`
      i = end === -1 ? source.length : end + 3
    } else if (!py && ch === "/" && next === "/") {
      const end = source.indexOf("\n", i)
      i = end === -1 ? source.length : end
    } else if (!py && ch === "/" && next === "*") {
      let at = i + 2
      let depth = 1
      while (at < source.length && depth) {
        if (nests && source[at] === "/" && source[at + 1] === "*") (depth++, (at += 2))
        else if (source[at] === "*" && source[at + 1] === "/") (depth--, (at += 2))
        else at++
      }
      code += source.slice(i, at).replace(/[^\n]/g, " ")
      i = at
    } else if (!py && /^[rR]#*"/.test(source.slice(i)) && !WORD.test(code.at(-1) ?? " ")) {
      // a raw string: rust writes r#"..."#, c++ writes R"delim(...)delim"
      const rust = source[i] === "r"
      const hashes = /^[rR](#*)"/.exec(source.slice(i))![1]
      const open = i + hashes.length + 2
      const fence = rust ? `"${hashes}` : `)${source.slice(open, source.indexOf("(", open))}"`
      const at = rust ? open : source.indexOf("(", open) + 1
      const end = source.indexOf(fence, at)
      const to = end === -1 ? source.length : end
      strings.push(source.slice(at, to))
      code += `${MARK}${strings.length - 1}${MARK}${"\n".repeat(count(source.slice(i, to), /\n/g))}`
      i = to + fence.length
    } else if (!js && ch === "'" && /^'(\\.|[^'\\])'/.test(source.slice(i))) {
      // a char literal, and its neighbour 'a in &'a str, which opens nothing
      code += " "
      i += /^'\\/.test(source.slice(i)) ? 4 : 3
    } else if (!js && ch === "'") {
      code += " "
      i++
    } else if (ch === '"' || ch === "'") {
      let at = i + 1
      while (at < source.length && source[at] !== ch && source[at] !== "\n")
        at += source[at] === "\\" ? 2 : 1
      strings.push(source.slice(i + 1, at))
      code += `${MARK}${strings.length - 1}${MARK}`
      // an apostrophe in jsx text opens a string that never closes, and its line has to survive that
      i = source[at] === "\n" ? at : at + 1
    } else if (js && ch === "`") {
      // an expression inside a template can hold an import
      let at = i + 1
      let flat = ""
      while (at < source.length && source[at] !== "`") {
        if (source[at] === "\\") at += 2
        else if (source[at] === "$" && source[at + 1] === "{") {
          let depth = 1
          let from = (at += 2)
          while (at < source.length && depth) {
            if (source[at] === "{") depth++
            else if (source[at] === "}") depth--
            if (depth) at++
          }
          flat += ` ${source.slice(from, at)} `
          at++
        } else at++
      }
      const inner = scrub(flat)
      strings.push("")
      const marker = `${MARK}${strings.length - 1}${MARK}`
      // its own strings land further along, so the numbers pointing at them move with them
      const base = strings.length
      strings.push(...inner.strings)
      const held = inner.code
        .replace(MARKED, (_, n) => `${MARK}${Number(n) + base}${MARK}`)
        .replace(/\n/g, " ")
      // `${install(tool)}` calls install, and the lines it spans stay behind it
      code += `${marker}${held}${"\n".repeat(count(source.slice(i, at), /\n/g))}`
      i = at + 1
    } else if (js && ch === "/" && !divides()) {
      let at = i + 1
      let klass = false
      while (at < source.length && (klass || source[at] !== "/") && source[at] !== "\n") {
        if (source[at] === "\\") at++
        else if (source[at] === "[") klass = true
        else if (source[at] === "]") klass = false
        at++
      }
      code += " "
      // a regex ends with its line, and eating that newline moves every line below it
      i = source[at] === "\n" ? at : at + 1
    } else {
      code += ch
      i++
    }
  }
  return { code, strings }
}

export interface Symbols {
  /** what a file hands out, so its api surface rather than its size */
  exports: number
  /** what it declares itself, exported here or not, so 0 means it only forwards */
  declares: number
  /** top level, not the callbacks inside */
  functions: number
  classes: number
}

const NAMED = /export\s*\{([^}]*)\}/g
const DECLARED =
  /(^|[\s;}])export\s+(default\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum|abstract)\b/g
// its own, whether it exports it here or at the bottom. `type {` is a re-export, not a
// declaration, and a body holding one is indented, so only the first column counts
const OWN =
  /^(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var|interface|enum|abstract|declare|namespace|type(?!\s*\{))\b/gm
const FUNCTIONS = /(^|[\s;}])(async\s+)?function\b/g
// a const bound to an arrow in the first column: a declaration
const ARROWS =
  /^(export\s+)?const\s+[\w$]+[^=\n]*=\s*(async\s+)?(\([^)]*\)|[\w$]+)\s*(:[^=\n]*)?=>/gm
const CLASSES = /(^|[\s;}])(export\s+|default\s+|abstract\s+)*class\s+[\w$]/g

/** what a file declares, off the same scrubbed code */
export function symbols(source: string): Symbols {
  const { code } = scrub(source)
  const listed = [...code.matchAll(NAMED)].reduce(
    (sum, m) => sum + m[1].split(",").filter((name) => name.trim()).length,
    0,
  )
  return {
    exports: listed + count(code, DECLARED),
    declares: count(code, OWN),
    functions: count(code, FUNCTIONS) + count(code, ARROWS),
    classes: count(code, CLASSES),
  }
}

// read only what survived the scrub
const STATIC = new RegExp(
  `(?:^|[\\s;})])(import|export)\\s+(type\\s+)?([^${MARK}]*?\\bfrom\\s*)?${MARK}(\\d+)${MARK}`,
  "g",
)
const CALLS = new RegExp(`\\b(import|require)\\s*\\(\\s*${MARK}(\\d+)${MARK}`, "g")

/** every specifier, reusing a scrub the caller did */
export function specifiers(source: string, done?: ReturnType<typeof scrub>): Specifier[] {
  const { code, strings } = done ?? scrub(source)
  const found: Specifier[] = []

  for (const m of code.matchAll(STATIC)) {
    const text = strings[Number(m[4])]
    const clause = m[3] ?? ""
    if (text)
      found.push({
        text,
        type: !!m[2] || erased(clause),
        lazy: false,
        via: m[1] === "export",
        names: bound(clause),
      })
  }
  for (const m of code.matchAll(CALLS)) {
    const text = strings[Number(m[2])]
    if (text) found.push({ text, type: false, lazy: m[1] === "import", via: false, names: [] })
  }
  return found
}

/** what a language other than javascript asks for, off its own patterns */
export function foreign(source: string, dialect: Dialect, done?: ReturnType<typeof scrub>) {
  const { code, strings } = done ?? scrub(source, dialect.flavour)
  // an include names its file in quotes, so for c the scrub is put back before reading
  const undo = (text: string) => text.replace(MARKED, (_, n) => strings[Number(n)] ?? "")
  const read = dialect.quoted
    ? code.replace(MARKED, (_, n) => JSON.stringify(strings[Number(n)] ?? ""))
    : code
  const found: Specifier[] = []
  for (const pattern of dialect.imports)
    for (const m of read.matchAll(pattern)) {
      // a path attribute names the file in a string, which the scrub turned into a marker
      const path = /#\[path\s*=\s*([^\]]*)\]/.exec(m[0])
      const said = (
        path ? undo(path[1]).replace(/["\s]/g, "") : (m.slice(1).filter(Boolean).at(-1) ?? "")
      ).trim()
      // an angled include is the toolchain's, never a file in this repo
      const outside = m[1] === "<"
      // only the first reading of a statement is a claim: `use a::{b}` says a is a module
      // and guesses that b might be one too
      const held = dialect.expand ? dialect.expand(said) : [said]
      held.forEach((text, which) => {
        if (text)
          found.push({ text, type: outside, lazy: false, via: false, names: [], guess: which > 0 })
      })
    }
  return found
}

/** every declaration a language other than javascript makes, with where it starts */
export function declared(code: string, dialect: Dialect) {
  const found: { name: string; at: number; kind: "function" | "class" }[] = []
  for (const { kind, re } of dialect.decls)
    for (const m of code.matchAll(re)) found.push({ name: m[1], at: m.index + m[0].length, kind })
  return found.sort((a, b) => a.at - b.at)
}
