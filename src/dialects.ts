// owner: finn
// goal: how each language spells a comment, an import and a declaration

export type Flavour = "js" | "c" | "py" | "rs"

/** the shape onlyIn needs: enough of a module to keep its edges honest */
interface Held {
  lang: string
  out: { to: string }[]
  in: string[]
}

export interface Dialect {
  id: string
  label: string
  exts: string[]
  /** how its strings and comments are written, which is all the scrubber needs */
  flavour: Flavour
  /** a specifier as written: `use a::b`, `from a.b import c`, `#include "x.h"` */
  imports: RegExp[]
  /** its specifier is written in quotes, so the scrub has to be undone to read it */
  quoted?: boolean
  /** one statement can name several modules: `use a::{b, c}` is two */
  expand?: (text: string) => string[]
  /** what counts as a declaration, name in the first group */
  decls: { kind: "function" | "class"; re: RegExp }[]
}

// prettier-ignore
const DIALECTS: Dialect[] = [
  {
    id: "ts", label: "TypeScript", exts: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],
    flavour: "js", imports: [], decls: [],
  },
  {
    id: "rust", label: "Rust", exts: ["rs"], flavour: "rs",
    // `mod x;` names a file, `use a::b` names a path through the crate
    imports: [
      // the attribute names the file outright, and the plain form names a module
      /#\[path\s*=\s*[^\]]*\]\s*(?:pub\s+(?:\([^)]*\)\s*)?)?mod\s+[A-Za-z_]\w*\s*;|(?:^|[\s;}])(?:pub\s+(?:\([^)]*\)\s*)?)?mod\s+([A-Za-z_]\w*)\s*;/gm,
      /(?:^|[\s;}])(?:pub\s+(?:\([^)]*\)\s*)?)?use\s+([^;]+);/gm,
    ],
    // `use crate::a::{b, c as d}` names crate::a, crate::a::b and crate::a::c
    expand: (text) => {
      const at = text.indexOf("{")
      const head = (at === -1 ? text : text.slice(0, at)).replace(/::\s*$/, "").trim()
      if (at === -1) return [head.replace(/\s+as\s+\w+$/, "").trim()]
      const inner = text.slice(at + 1, text.lastIndexOf("}"))
      return [
        head,
        ...inner
          .split(",")
          .map((one) => one.replace(/\s+as\s+[\w*]+/, "").trim())
          .filter((one) => one && one !== "self" && !one.includes("{"))
          .map((one) => `${head}::${one}`),
      ]
    },
    decls: [
      { kind: "function", re: /(?:^|[\s;}])(?:pub\s+(?:\([^)]*\)\s*)?)?(?:async\s+|const\s+|unsafe\s+|extern\s+"[^"]*"\s+)*fn\s+([A-Za-z_]\w*)/gm },
      { kind: "class", re: /(?:^|[\s;}])(?:pub\s+(?:\([^)]*\)\s*)?)?(?:struct|enum|trait|union|type)\s+([A-Za-z_]\w*)/gm },
      { kind: "function", re: /(?:^|[\s;}])macro_rules!\s*([A-Za-z_]\w*)/gm },
    ],
  },
  {
    id: "python", label: "Python", exts: ["py", "pyi"], flavour: "py",
    // prettier-ignore
    imports: [
      /^[^\S\n]*from\s+([.\w]+)\s+import\b/gm,
      /^[^\S\n]*import\s+([.\w]+)/gm,
    ],
    // a nested def is a closure, and only the first column declares
    decls: [
      { kind: "function", re: /^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm },
      { kind: "class", re: /^class\s+([A-Za-z_]\w*)/gm },
    ],
  },
  {
    id: "jvm", label: "Java", exts: ["java", "kt", "kts", "scala", "groovy"], flavour: "c",
    imports: [/^[^\S\n]*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)/gm],
    // prettier-ignore
    decls: [
      { kind: "class", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|internal\s+|open\s+|final\s+|abstract\s+|sealed\s+|data\s+|static\s+|suspend\s+|inline\s+|override\s+)*(?:class|interface|object|enum|record|trait)\s+([A-Za-z_]\w*)/gm },
      { kind: "function", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|internal\s+|open\s+|override\s+|suspend\s+|inline\s+|operator\s+|tailrec\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.<>]+\.)?([A-Za-z_]\w*)/gm },
      { kind: "function", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|static\s+|final\s+|synchronized\s+|abstract\s+|native\s+)+(?:<[^>]*>\s*)?[\w.<>\[\]]+\s+([A-Za-z_]\w*)\s*\([^;)]*\)\s*(?:throws[^{]*)?\{/gm },
    ],
  },
  {
    id: "go", label: "Go", exts: ["go"], flavour: "c",
    // one import per line, or a block of them in parens. A member line holds nothing but
    // an optional alias and the path: composite literals carry commas, statements carry more
    imports: [
      /^import\s+(?:[\w.]+\s+)?"([^"\n]+)"/gm,
      /^[^\S\n]+(?!return\b)(?:[\w.]+[^\S\n]+)?"([^"\n]+)"[^\S\n]*(?:\/\/.*)?$/gm,
    ],
    quoted: true,
    decls: [
      { kind: "function", re: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm },
      { kind: "class", re: /^type\s+([A-Za-z_]\w*)/gm },
    ],
  },
  {
    id: "swift", label: "Swift", exts: ["swift"], flavour: "c",
    imports: [/^[^\S\n]*import\s+([\w.]+)/gm],
    decls: [
      { kind: "function", re: /(?:^|[\s;}])(?:public\s+|private\s+|internal\s+|fileprivate\s+|open\s+|static\s+|override\s+|final\s+|mutating\s+)*func\s+([A-Za-z_]\w*)/gm },
      { kind: "class", re: /(?:^|[\s;}])(?:public\s+|private\s+|internal\s+|fileprivate\s+|open\s+|final\s+)*(?:class|struct|enum|protocol|actor|extension)\s+([A-Za-z_]\w*)/gm },
    ],
  },
  {
    id: "csharp", label: "C#", exts: ["cs"], flavour: "c",
    imports: [/^[^\S\n]*using\s+(?:static\s+)?([\w.]+)\s*;/gm],
    // prettier-ignore
    decls: [
      { kind: "class", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|internal\s+|abstract\s+|sealed\s+|static\s+|partial\s+|record\s+)*(?:class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/gm },
      { kind: "function", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|virtual\s+|override\s+|async\s+|sealed\s+)+(?:[\w.<>\[\]?]+\s+)([A-Za-z_]\w*)\s*\([^;)]*\)\s*\{/gm },
    ],
  },
  {
    id: "ruby", label: "Ruby", exts: ["rb"], flavour: "py",
    quoted: true,
    imports: [/^[^\S\n]*(?:require|require_relative)\s*\(?\s*["']([^"'\n]+)["']/gm],
    decls: [
      { kind: "function", re: /^[^\S\n]*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/gm },
      { kind: "class", re: /^[^\S\n]*(?:class|module)\s+([A-Za-z_]\w*)/gm },
    ],
  },
  {
    id: "php", label: "PHP", exts: ["php"], flavour: "c",
    quoted: true,
    imports: [/^[^\S\n]*(?:use|require|require_once|include|include_once)\s*\(?\s*["']?([\w\\/.]+)/gm],
    decls: [
      { kind: "function", re: /(?:^|[\s;}])function\s+([A-Za-z_]\w*)/gm },
      { kind: "class", re: /(?:^|[\s;}])(?:abstract\s+|final\s+)*(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/gm },
    ],
  },
  {
    id: "c", label: "C", exts: ["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "hxx", "ipp"],
    flavour: "c",
    // a quoted include is this project's, an angled one is the toolchain's
    quoted: true,
    imports: [/^[^\S\n]*#\s*include\s*(?:(<)([^>\n]+)>|"([^"\n]+)")/gm],
    // prettier-ignore
    decls: [
      { kind: "class", re: /(?:^|[\s;}])(?:struct|class|union|enum)\s+([A-Za-z_]\w*)\s*(?::[^{;]*)?\{/gm },
      { kind: "function", re: /^(?:[A-Za-z_][\w:<>,*&\s]*?[\s*&])([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:const\s*)?\{/gm },
    ],
  },
]

const BY_EXT = new Map<string, Dialect>(
  DIALECTS.flatMap((one) => one.exts.map((ext) => [ext, one] as [string, Dialect])),
)

export const dialectOf = (path: string): Dialect | undefined =>
  BY_EXT.get(path.split(".").pop()?.toLowerCase() ?? "")

/** every extension desprawl can read a graph out of */
export const READS = new RegExp(`\\.(${[...BY_EXT.keys()].join("|")})$`, "i")

export const LANGUAGES = DIALECTS.map((one) => one.id)

/**
 * Where a specifier lands. Each language spells the same idea differently: rust walks its
 * crate, python its packages, the jvm its folders, c its include paths. Nothing here reads
 * a build file, so a target the repo does not hold is simply outside it.
 */
export function candidates(
  dialect: Dialect,
  text: string,
  from: string,
  /** crate or package name to the folder holding it, for a workspace of several */
  parts_: Map<string, string> = new Map(),
): string[] {
  const dir = from.split("/").slice(0, -1)
  const up = (n: number) => dir.slice(0, Math.max(0, dir.length - n))
  const exts = dialect.exts

  if (dialect.id === "rust") {
    // #[path = "x.rs"] says the file outright, relative to this one
    if (/\.rs$/.test(text)) return [[...dir, ...text.split("/")].join("/"), text]
    // a file is a module, so its parent is the folder it sits in and `super::x` is a sibling
    const parts = text.split("::").filter((one) => one && one !== "*")
    if (!parts.length) return []
    if (parts.length === 1 && !/^(crate|super|self|std|core|alloc)$/.test(parts[0]))
      return [[...dir, `${parts[0]}.rs`].join("/"), [...dir, parts[0], "mod.rs"].join("/")]
    const [head, ...rest] = parts
    // the file that declares this folder as a module
    const owner = (at: string[]) => [
      [...at, "mod.rs"].join("/"),
      [...at, "lib.rs"].join("/"),
      [...at, "main.rs"].join("/"),
      `${at.join("/")}.rs`,
    ]
    // a sibling crate in the same workspace is named, not pathed
    const crate = parts_.get(head.replace(/_/g, "-")) ?? parts_.get(head)
    if (crate && head !== "crate") {
      const held = rest.length ? rest : ["lib"]
      return [
        ...spell([crate, "src", ...held], exts),
        ...spell([crate, "src", ...held, "mod"], exts),
        `${crate}/src/lib.rs`,
      ]
    }
    // `a::b::One` names the module b as often as a module called One, so both are tried
    const reach = (at: string[], held: string[]) =>
      held.length
        ? [
            ...spell([...at, ...held], exts),
            ...spell([...at, ...held, "mod"], exts),
            ...(held.length > 1 ? spell([...at, ...held.slice(0, -1)], exts) : []),
            ...(held.length > 1 ? spell([...at, ...held.slice(0, -1), "mod"], exts) : []),
            ...owner(at),
          ]
        : owner(at)
    if (head === "crate") {
      const src = from.split("/").lastIndexOf("src")
      return reach(src === -1 ? [] : from.split("/").slice(0, src + 1), rest)
    }
    if (head === "self") return reach(dir, rest)
    if (head === "super" && !rest.length && /\/(lib|main|mod)\.rs$/.test(from)) return [from]
    if (head === "super") {
      let back = 0
      while (rest[0] === "super") {
        rest.shift()
        back++
      }
      // `super::x` is x beside this file, and bare `super` is the folder itself
      return reach(back ? up(back) : dir, rest)
    }
    return []
  }

  if (dialect.id === "python") {
    const dots = /^\.+/.exec(text)?.[0].length ?? 0
    const parts = text.slice(dots).split(".").filter(Boolean)
    const base = dots ? up(dots - 1) : []
    const held = [...base, ...parts]
    // `from a.b import c` may name the module a/b or the thing c inside a/b
    return [
      ...spell(held, exts),
      ...spell([...held, "__init__"], exts),
      ...(parts.length > 1 ? spell(held.slice(0, -1), exts) : []),
    ]
  }

  if (dialect.id === "jvm") {
    const parts = text.replace(/\.\*$/, "").split(".").filter(Boolean)
    // `import a.b.thing` names a top level function as often as a class called thing, and
    // the file holding it is one segment up
    const held = parts.length > 1 ? parts.slice(0, -1) : parts
    const roots = [
      [],
      ["src", "main", "kotlin"],
      ["src", "main", "java"],
      ["app", "src", "main", "kotlin"],
      ["app", "src", "main", "java"],
    ]
    return [
      ...roots.flatMap((at) => spell([...at, ...parts], exts)),
      ...roots.flatMap((at) => spell([...at, ...held], exts)),
      ...spell(parts, exts),
      ...spell(["src", "main", "kotlin", ...parts], exts),
      ...spell(["src", "main", "java", ...parts], exts),
      ...spell(["app", "src", "main", "kotlin", ...parts], exts),
      ...spell(["app", "src", "main", "java", ...parts], exts),
    ]
  }

  if (dialect.id === "go") {
    // a go import names a folder, and every file in it is that package
    const parts = text.split("/").filter(Boolean)
    return parts.flatMap((_, at) => {
      const held = parts.slice(at)
      return [`${held.join("/")}/`, ...spell(held, exts), ...spell([...held, held.at(-1)!], exts)]
    })
  }

  if (dialect.id === "swift" || dialect.id === "csharp" || dialect.id === "php") {
    const parts = text.split(/[.\\]/).filter(Boolean)
    return [
      ...spell(parts, exts),
      ...spell([parts.at(-1) ?? ""], exts),
      ...spell(["src", ...parts], exts),
    ]
  }

  if (dialect.id === "ruby") {
    const parts = text.split("/").filter((one) => one && one !== ".")
    return [
      [...dir, ...parts].join("/") + ".rb",
      parts.join("/") + ".rb",
      ["lib", ...parts].join("/") + ".rb",
      ["app", ...parts].join("/") + ".rb",
    ]
  }

  // c: relative to the file, then to the roots anybody puts headers in
  const held = text.split("/").filter((p) => p && p !== ".")
  return [
    [...dir, ...held].join("/"),
    held.join("/"),
    ["include", ...held].join("/"),
    ["src", ...held].join("/"),
  ]
}

const spell = (parts: string[], exts: string[]): string[] =>
  parts.length ? exts.map((ext) => `${parts.join("/")}.${ext}`) : []

/** one language of a mixed repo, with every edge that left it dropped */
export function onlyIn<T extends { modules: Record<string, Held> }>(graph: T, lang: string): T {
  const held = Object.fromEntries(
    Object.entries(graph.modules)
      .filter(([, one]) => one.lang === lang)
      .map(([path, one]) => [path, { ...one, out: [...one.out], in: [...one.in] }]),
  )
  for (const one of Object.values(held)) {
    one.out = one.out.filter((edge) => held[edge.to])
    one.in = one.in.filter((from) => held[from])
  }
  return { ...graph, modules: held }
}

/**
 * Words the language itself owns, and what its runtime provides. Without these a `when` in
 * kotlin and a `Some` in rust read as calls to something nobody declared, which is not a
 * gap in the repo but a gap in what we know about the language.
 */
// prettier-ignore
const OWNED: Record<string, { keywords: string[]; runtime: string[] }> = {
  rust: {
    keywords: ["let", "mut", "match", "loop", "move", "ref", "dyn", "impl", "where", "as", "crate",
      "super", "self", "Self", "pub", "fn", "struct", "enum", "trait", "union", "type", "use", "mod",
      "unsafe", "extern", "static", "const", "async", "await", "cfg", "derive", "test", "allow",
      "warn", "deny", "inline", "repr", "doc", "must_use", "non_exhaustive", "default", "in",
      "for", "while", "if", "else", "return", "break", "continue", "true", "false"],
    runtime: ["Some", "None", "Ok", "Err", "Vec", "String", "Box", "Option", "Result", "HashMap",
      "HashSet", "BTreeMap", "BTreeSet", "VecDeque", "Rc", "Arc", "RefCell", "Cell", "Mutex",
      "RwLock", "Cow", "PathBuf", "Path", "OsString", "Duration", "Instant", "Iterator", "Into",
      "From", "TryFrom", "TryInto", "Default", "Clone", "Copy", "Debug", "Display", "Eq", "PartialEq",
      "Ord", "PartialOrd", "Hash", "Send", "Sync", "Sized", "Drop", "Fn", "FnMut", "FnOnce",
      "println", "print", "eprintln", "eprint", "format", "write", "writeln", "vec", "panic",
      "assert", "assert_eq", "assert_ne", "unreachable", "todo", "unimplemented", "matches",
      "len", "push", "pop", "insert", "remove", "get", "iter", "into_iter", "collect", "map",
      "filter", "unwrap", "expect", "clone", "to_string", "new", "with_capacity", "open", "read",
      "write_all", "create", "now", "min", "max", "abs", "sqrt", "powi", "powf", "floor", "ceil"],
  },
  jvm: {
    keywords: ["when", "is", "in", "as", "by", "it", "this", "super", "val", "var", "fun", "object",
      "class", "interface", "typealias", "companion", "init", "constructor", "return", "throw",
      "try", "catch", "finally", "if", "else", "for", "while", "do", "break", "continue", "null",
      "true", "false", "package", "import", "internal", "open", "override", "suspend", "lateinit",
      "vararg", "reified", "out", "sealed", "data", "enum", "annotation", "operator", "infix",
      "inline", "noinline", "crossinline", "tailrec", "external", "expect", "actual", "new",
      "public", "private", "protected", "static", "final", "abstract", "synchronized", "void"],
    runtime: ["String", "Int", "Long", "Double", "Float", "Boolean", "Char", "Byte", "Short", "Any",
      "Unit", "Nothing", "List", "MutableList", "Set", "MutableSet", "Map", "MutableMap", "Array",
      "Pair", "Triple", "Sequence", "Iterable", "Comparable", "Throwable", "Exception",
      "RuntimeException", "Integer", "System", "Math", "Objects", "Optional", "Stream", "Thread",
      "Runnable", "Override", "Deprecated", "SuppressWarnings", "Test", "Before", "After",
      "listOf", "mutableListOf", "setOf", "mapOf", "arrayOf", "emptyList", "let", "run", "with",
      "apply", "also", "takeIf", "takeUnless", "lazy", "require", "check", "error", "TODO",
      "println", "print", "toString", "equals", "hashCode", "getString", "getSystemService",
      "findViewById", "setContentView", "startActivity", "finish", "onCreate", "onResume",
      "onPause", "onDestroy", "onStart", "onStop", "getIntent", "getContext", "getActivity"],
  },
  python: {
    keywords: ["def", "class", "return", "yield", "await", "async", "lambda", "if", "elif", "else",
      "for", "while", "try", "except", "finally", "with", "as", "import", "from", "pass", "raise",
      "assert", "del", "global", "nonlocal", "not", "and", "or", "is", "in", "None", "True",
      "False", "self", "cls", "match", "case"],
    runtime: ["print", "len", "range", "str", "int", "float", "bool", "list", "dict", "set",
      "tuple", "type", "isinstance", "issubclass", "enumerate", "zip", "map", "filter", "sorted",
      "reversed", "sum", "min", "max", "abs", "round", "open", "input", "format", "repr", "hash",
      "id", "dir", "vars", "getattr", "setattr", "hasattr", "delattr", "callable", "iter", "next",
      "any", "all", "super", "property", "staticmethod", "classmethod", "Exception", "ValueError",
      "TypeError", "KeyError", "IndexError", "RuntimeError", "StopIteration", "NotImplementedError",
      "append", "extend", "keys", "values", "items", "get", "join", "split", "strip", "replace"],
  },
  go: {
    keywords: ["func", "type", "struct", "interface", "map", "chan", "go", "defer", "select",
      "case", "switch", "range", "return", "if", "else", "for", "break", "continue", "var",
      "const", "package", "import", "nil", "true", "false", "make", "new"],
    runtime: ["len", "cap", "append", "copy", "delete", "panic", "recover", "print", "println",
      "close", "complex", "real", "imag", "error", "string", "int", "int64", "float64", "bool",
      "byte", "rune", "Printf", "Println", "Sprintf", "Errorf", "New", "Error", "String"],
  },
  swift: {
    keywords: ["func", "let", "var", "class", "struct", "enum", "protocol", "extension", "actor",
      "if", "else", "guard", "for", "while", "repeat", "switch", "case", "default", "return",
      "throw", "throws", "try", "catch", "defer", "import", "self", "Self", "init", "deinit",
      "static", "public", "private", "internal", "fileprivate", "open", "final", "override",
      "mutating", "nil", "true", "false", "some", "any", "where", "in", "async", "await"],
    runtime: ["String", "Int", "Double", "Float", "Bool", "Array", "Dictionary", "Set", "Optional",
      "Result", "Error", "print", "map", "filter", "reduce", "count", "append", "first", "last",
      "isEmpty", "compactMap", "flatMap", "sorted", "contains", "forEach"],
  },
  csharp: {
    keywords: ["class", "interface", "struct", "enum", "record", "namespace", "using", "public",
      "private", "protected", "internal", "static", "readonly", "const", "virtual", "override",
      "abstract", "sealed", "partial", "async", "await", "var", "new", "return", "if", "else",
      "for", "foreach", "while", "do", "switch", "case", "break", "continue", "try", "catch",
      "finally", "throw", "null", "true", "false", "this", "base", "get", "set", "void", "in"],
    runtime: ["String", "Int32", "Int64", "Double", "Boolean", "List", "Dictionary", "IEnumerable",
      "Task", "Console", "WriteLine", "ToString", "Equals", "GetHashCode", "Select", "Where",
      "ToList", "Count", "Any", "First", "FirstOrDefault", "Add", "Remove", "Contains"],
  },
  ruby: {
    keywords: ["def", "class", "module", "end", "if", "elsif", "else", "unless", "while", "until",
      "for", "in", "do", "then", "begin", "rescue", "ensure", "raise", "return", "yield", "self",
      "nil", "true", "false", "and", "or", "not", "require", "require_relative", "attr_accessor",
      "attr_reader", "attr_writer", "new", "case", "when", "lambda", "proc"],
    runtime: ["puts", "print", "p", "each", "map", "select", "reject", "reduce", "inject", "length",
      "size", "push", "pop", "first", "last", "include?", "empty?", "nil?", "to_s", "to_i", "to_a",
      "freeze", "dup", "clone", "send", "respond_to?", "instance_variable_get"],
  },
  php: {
    keywords: ["function", "class", "interface", "trait", "enum", "namespace", "use", "public",
      "private", "protected", "static", "abstract", "final", "const", "var", "return", "if",
      "else", "elseif", "foreach", "for", "while", "do", "switch", "case", "break", "continue",
      "try", "catch", "finally", "throw", "new", "echo", "print", "null", "true", "false",
      "this", "self", "parent", "extends", "implements", "require", "include", "as", "fn"],
    runtime: ["array", "count", "isset", "unset", "empty", "strlen", "str_replace", "implode",
      "explode", "array_map", "array_filter", "array_merge", "in_array", "json_encode",
      "json_decode", "sprintf", "printf", "var_dump", "die", "exit", "preg_match", "preg_replace"],
  },
  c: {
    keywords: ["if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue",
      "return", "goto", "sizeof", "typedef", "struct", "union", "enum", "static", "extern", "const",
      "volatile", "inline", "register", "auto", "void", "char", "short", "int", "long", "float",
      "double", "signed", "unsigned", "class", "public", "private", "protected", "virtual",
      "template", "typename", "namespace", "using", "new", "delete", "this", "operator", "friend",
      "explicit", "constexpr", "noexcept", "nullptr", "true", "false", "try", "catch", "throw"],
    runtime: ["printf", "fprintf", "sprintf", "snprintf", "scanf", "malloc", "calloc", "realloc",
      "free", "memcpy", "memset", "memmove", "strlen", "strcpy", "strncpy", "strcmp", "strncmp",
      "strcat", "fopen", "fclose", "fread", "fwrite", "fseek", "ftell", "exit", "abort", "assert",
      "qsort", "bsearch", "rand", "srand", "time", "clock", "abs", "pow", "sqrt", "floor", "ceil",
      "std", "string", "vector", "cout", "cerr", "cin", "endl", "size", "push_back", "begin", "end"],
  },
}

export const keywordsOf = (lang: string): Set<string> => new Set(OWNED[lang]?.keywords ?? [])
export const runtimeOf = (lang: string): Set<string> => new Set(OWNED[lang]?.runtime ?? [])
