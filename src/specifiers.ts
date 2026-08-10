// owner: finn
// goal: every module a file asks for, and nothing a string pretends to

export interface Specifier {
  text: string // what stood between the quotes
  type: boolean // erased at build time, so a weaker edge
  lazy: boolean // import(), a chunk boundary too
  via: boolean // `export ... from`, so this file forwards rather than uses
  /** the names it binds locally, and what each is called where it came from */
  names: { local: string; name: string }[]
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

const WORD = /[A-Za-z0-9_$]/
export const MARK = ""

/** comments and regex become spaces, strings a marker pointing at their text */
export function scrub(source: string): { code: string; strings: string[] } {
  const strings: string[] = []
  let code = ""
  let i = 0

  // after a value a slash divides, otherwise it opens a regex
  const divides = (): boolean => {
    for (let back = code.length - 1; back >= 0; back--) {
      const ch = code[back]
      if (/\s/.test(ch)) continue
      return WORD.test(ch) || ch === ")" || ch === "]"
    }
    return false
  }

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i)
      i = end === -1 ? source.length : end
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2)
      code += source.slice(i, end === -1 ? source.length : end).replace(/[^\n]/g, " ")
      i = end === -1 ? source.length : end + 2
    } else if (ch === '"' || ch === "'") {
      let at = i + 1
      while (at < source.length && source[at] !== ch && source[at] !== "\n")
        at += source[at] === "\\" ? 2 : 1
      strings.push(source.slice(i + 1, at))
      code += `${MARK}${strings.length - 1}${MARK}`
      i = at + 1
    } else if (ch === "`") {
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
      code += `${MARK}${strings.length - 1}${MARK}`
      strings.push(...inner.strings)
      i = at + 1
    } else if (ch === "/" && !divides()) {
      let at = i + 1
      let klass = false
      while (at < source.length && (klass || source[at] !== "/") && source[at] !== "\n") {
        if (source[at] === "\\") at++
        else if (source[at] === "[") klass = true
        else if (source[at] === "]") klass = false
        at++
      }
      code += " "
      i = at + 1
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

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length

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
