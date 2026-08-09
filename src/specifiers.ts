// owner: finn
// goal: every module a file asks for, and nothing a string pretends to

export interface Specifier {
  text: string // what stood between the quotes
  type: boolean // erased at build time, so a weaker edge
  lazy: boolean // import(), a chunk boundary too
}

const WORD = /[A-Za-z0-9_$]/
const MARK = ""

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

// read only what survived the scrub
const STATIC = new RegExp(
  `(?:^|[\\s;})])(import|export)\\s+(type\\s+)?(?:[^${MARK}]*?\\bfrom\\s*)?${MARK}(\\d+)${MARK}`,
  "g",
)
const CALLS = new RegExp(`\\b(import|require)\\s*\\(\\s*${MARK}(\\d+)${MARK}`, "g")

/** every module specifier in a file */
export function specifiers(source: string): Specifier[] {
  const { code, strings } = scrub(source)
  const found: Specifier[] = []

  for (const m of code.matchAll(STATIC)) {
    const text = strings[Number(m[3])]
    if (text) found.push({ text, type: !!m[2], lazy: false })
  }
  for (const m of code.matchAll(CALLS)) {
    const text = strings[Number(m[2])]
    if (text) found.push({ text, type: false, lazy: m[1] === "import" })
  }
  return found
}
