// owner: finn
// goal: every name used like a call inside one body, placed where it came from

export interface Symbol {
  /** the dialect its file was read with, so a mixed repo can be split */
  lang: string
  /** file#name, unique: a file declares a name once */
  id: string
  file: string
  name: string
  /** module is the file's own top level, which declares nothing and runs on import */
  kind: "function" | "class" | "component" | "module"
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

// a field, not a reach. The ? tells it from a ternary
export const KEY = /[{,;]\s*[A-Za-z_$][\w$]*\s*:\s*$/
// onClick={save} calls save. a dot owns the name, a spread does not
export const USED = /(?<![\w$])(?<!(?<!\.)\.)([A-Za-z_$][\w$]*)/g
// a method on a value: the receiver is unknown, but the name it calls is not
export const METHOD = /(?<=[\w$)\]])(?:\.|::|->)([A-Za-z_]\w*)\s*\(/g
export const CALLED = /^[^\S\n]*(?:<[^<>()]*>)?[^\S\n]*\(/

/** what one body is read against: the file it sits in, and everything already declared */
export interface Sited {
  file: string
  lang: string
  /** the file's own top level has no parameters, so a top level body says so */
  top: boolean
  /** the words the language owns, and the names its runtime hands out */
  owns: Set<string>
  runtime: Set<string>
  symbols: Record<string, Symbol>
  /** every file declaring a name, for a method call that names no file */
  declares: Map<string, string[]>
  /** the files this one's imports name, which is as far as a method call may land */
  reaches: Set<string>
  /** what the file's imports bind, per file, so a re-export can be followed */
  bindings: Map<string, Map<string, { file?: string; name: string; pkg?: string; type?: boolean }>>
  /** values a file binds that are not declarations, like state setters */
  locals: Map<string, Set<string>>
  /** the parameters of this body, which name themselves rather than anything outside */
  takes: Set<string>
  link: (from: string, to: string) => void
  lost: (from: string, name: string) => void
}

/** the runtime names it reached for, which is what coverage counts against */
export function siting(symbol: Symbol, body: string, at: Sited): number {
  const { file, lang, top, owns, runtime, symbols, declares, bindings, locals, takes } = at
  const { reaches, link, lost } = at
  const local = bindings.get(file)!
  let builtin = 0
  const seen = new Set<string>()
  // a method call names no file, so it lands only when one file declares that name
  if (lang && lang !== "ts")
    for (const m of body.matchAll(METHOD)) {
      const name = m[1]
      if (owns.has(name) || name === symbol.name) continue
      // the runtime only wins where nothing here declares that name
      if (runtime.has(name) && !declares.has(name)) continue
      const here = symbols[`${file}#${name}`]
      if (here) {
        link(symbol.id, here.id)
        continue
      }
      const held = declares.get(name)
      // one file declaring it is only an answer if this file reaches that file: otherwise a
      // helper called `lower` collects every `x.lower()` the repo writes
      if (held?.length === 1 && reaches.has(held[0])) {
        const there = symbols[`${held[0]}#${name}`]
        if (there && there.id !== symbol.id) link(symbol.id, there.id)
      }
    }
  for (const m of body.matchAll(USED)) {
    const name = m[1]
    // coverage counts call shaped mentions only
    const shaped = CALLED.test(body.slice(m.index + name.length, m.index + name.length + 40))
    if (KEY.test(body.slice(Math.max(0, m.index - 24), m.index + name.length + 2))) continue
    if (owns.has(name) || seen.has(name)) continue
    seen.add(name)
    if (name === symbol.name) continue

    // a file's top level has no parameters, so the first brackets are jsx
    if (!top && takes.has(name)) continue
    const here = symbols[`${file}#${name}`]
    if (here) {
      link(symbol.id, here.id)
      continue
    }
    if (locals.get(file)?.has(name)) continue
    const came = local.get(name)
    // the runtime holds a `history` and a `location` too, and an import beats both
    if (!came && runtime.has(name) && !symbols[`${file}#${name}`]) {
      if (shaped) builtin++
      continue
    }
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
    if (shaped) lost(symbol.id, name)
  }
  return builtin
}
