// owner: finn
// goal: how each language spells a comment, an import and a declaration

// php is c shaped, but a single quote opens a string there and a hash opens a comment,
// and markup comments with an angle bracket, so a slash in an attribute opens nothing
export type Flavour = "js" | "c" | "py" | "rs" | "php" | "xml" | "sfc"

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
  /** a specifier names a namespace of types rather than one file, so only the types this
   *  file writes down are edges: a namespace hands out everything in it */
  used?: boolean
  /** what counts as a declaration, name in the first group */
  decls: { kind: "function" | "class"; re: RegExp }[]
}

// enough of a type to hold `Dictionary<string, List<int>>?`, `byte[]` and `A.B.Thing`
const CS_TYPE = String.raw`[A-Za-z_][\w.]*(?:\s*<[^<>;(){}=]*(?:<[^<>;(){}=]*>[^<>;(){}=]*)*>)?(?:\s*\[[,\s]*\])*\??`
const CS_MODS = String.raw`(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial|required|file|volatile|readonly)\s+)*`
// a statement opens the same way a member does, so the words one opens with are not a type
const CS_NOT = String.raw`(?!(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|partial|required|volatile|readonly|return|await|throw|yield|new|if|else|while|for|foreach|switch|case|do|using|lock|fixed|checked|unchecked|try|catch|finally|goto|break|continue|var|when|where|select|from|orderby|group|into|let|join|on|equals|by|nameof|typeof|sizeof|default|delegate|namespace|class|struct|interface|enum|record|event|operator|implicit|explicit|this|base|null|true|false|get|set|add|remove|value|in|out|ref|params)\b)`
// a member: a return type, a name, a parameter list, then a body, an arrow, or a semicolon
// where an interface and an abstract class declare without one
const CS_MEMBER = new RegExp(
  String.raw`^[^\S\n]*(?:\[[^\]\n]*\][^\S\n]*)*${CS_MODS}${CS_NOT}${CS_TYPE}\s+([A-Za-z_]\w*)\s*(?:<[^<>;(){}=]*>)?\s*\([^;{]*?\)\s*(?:where[^;{]*)?(?=[{=;])`,
  "gm",
)
// a constructor names no type at all, so a modifier is what tells it from a call
const CS_CTOR = new RegExp(
  String.raw`^[^\S\n]*(?:\[[^\]\n]*\][^\S\n]*)*(?:(?:public|private|protected|internal|static|unsafe|extern)\s+)+([A-Za-z_]\w*)\s*\([^;{]*?\)\s*(?::\s*(?:base|this)\s*\([^;{]*?\)\s*)?(?=\{|=>)`,
  "gm",
)

/** `use a::{b, c::{d, e}}` names four things, since a group can hold a group */
function opened(text: string): string[] {
  const at = text.indexOf("{")
  const head = (at === -1 ? text : text.slice(0, at)).replace(/::\s*$/, "").trim()
  if (at === -1) return [head.replace(/\s+as\s+[\w*]+$/, "").trim()]
  const inner = text.slice(at + 1, text.lastIndexOf("}"))
  const parts: string[] = []
  let depth = 0
  let held = ""
  for (const ch of inner) {
    if (ch === "{") depth++
    else if (ch === "}") depth--
    if (ch === "," && !depth) {
      parts.push(held)
      held = ""
    } else held += ch
  }
  parts.push(held)
  return [
    head,
    ...parts
      .map((one) => one.replace(/\s+as\s+[\w*]+/, "").trim())
      .filter((one) => one && one !== "self")
      .flatMap((one) => opened(`${head}::${one}`)),
  ]
}

// prettier-ignore
const DIALECTS: Dialect[] = [
  {
    id: "ts", label: "TypeScript",
    exts: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "vue", "svelte"],
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
    expand: opened,
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
    // a method is indented, and a class holding one declares nothing else
    decls: [
      { kind: "function", re: /^[^\S\n]*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm },
      { kind: "class", re: /^[^\S\n]*class\s+([A-Za-z_]\w*)/gm },
    ],
  },
  {
    id: "jvm", label: "Java", exts: ["java", "kt", "kts", "scala", "groovy"], flavour: "c",
    // the star at the end is part of the name: a package, not a class
    imports: [/^[^\S\n]*import\s+(?:static\s+)?([\w.]*[\w*])/gm],
    // prettier-ignore
    decls: [
      { kind: "class", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|internal\s+|open\s+|final\s+|abstract\s+|sealed\s+|data\s+|static\s+|suspend\s+|inline\s+|override\s+)*(?:class|interface|object|enum|record|trait)\s+([A-Za-z_]\w*)/gm },
      { kind: "function", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|internal\s+|open\s+|override\s+|suspend\s+|inline\s+|operator\s+|tailrec\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.<>]+\.)?([A-Za-z_]\w*)/gm },
      { kind: "function", re: /(?:^|[\s;}])(?:public\s+|private\s+|protected\s+|static\s+|final\s+|synchronized\s+|abstract\s+|native\s+)+(?:<[^>]*>\s*)?[\w.<>\[\]]+\s+([A-Za-z_]\w*)\s*\([^;)]*\)\s*(?:throws[^{]*)?\{/gm },
    ],
  },
  {
    id: "go", label: "Go", exts: ["go"], flavour: "c",
    // one import per line, or a block in parens
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
    // dart quotes a string either way and reads its own strings, so it scrubs as js does
    id: "dart", label: "Dart", exts: ["dart"], flavour: "js",
    quoted: true,
    // a part is a file of this library, and `part of` names the file holding it
    imports: [/^[^\S\n]*(?:import|export|part(?:\s+of)?)\s+["']([^"'\n]+)["']/gm],
    // prettier-ignore
    decls: [
      { kind: "class", re: /(?:^|[\s;}])(?:abstract\s+|base\s+|final\s+|sealed\s+|interface\s+|mixin\s+)*(?:class|mixin|enum|extension|typedef)\s+(?!on\b)([A-Za-z_]\w*)/gm },
      // it names its type first, so a statement of two words and a bracket reads the same
      { kind: "function", re: /^[^\S\n]*(?!(?:return|await|throw|yield|new|case|assert|if|else|for|while|switch|do)\b)(?:(?:static|external|factory|const|final|late|@override)\s+)*(?:[A-Za-z_][\w<>,\s?]*[\s>?])([A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*\([^;]*?\)\s*(?:async\*?|sync\*)?\s*(?=[{=])/gm },
    ],
  },
  {
    // a using names a namespace, and the files declaring one are what it reaches
    id: "csharp", label: "C#", exts: ["cs"], flavour: "c", used: true,
    // an alias names its namespace after the equals, and global is a modifier on the using
    imports: [
      /^[^\S\n]*(?:global\s+)?using\s+(?:static\s+)?(?:[A-Za-z_]\w*\s*=\s*)?([\w.]+)\s*;/gm,
    ],
    // prettier-ignore
    decls: [
      { kind: "class", re: /(?:^|[\s;}])(?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly|ref|unsafe|new|file|record)\s+)*(?:class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/gm },
      // a delegate names its return type first, so the word after it is not the name
      { kind: "class", re: /(?:^|[\s;}])(?:(?:public|private|protected|internal|static|new|unsafe)\s+)*delegate\s+[\w.<>,\[\]?]+\s+([A-Za-z_]\w*)\s*[(<]/gm },
      { kind: "function", re: CS_MEMBER },
      { kind: "function", re: CS_CTOR },
    ],
  },
  {
    // markup with a class behind it: what it maps, what it merges, and what it is called
    id: "xaml", label: "XAML", exts: ["xaml", "axaml"], flavour: "xml", quoted: true, used: true,
    imports: [
      /\bx:Class\s*=\s*"([\w.]+)"/g,
      // wpf writes clr-namespace, winui and uwp write using, and both name one namespace
      /\bxmlns:\w+\s*=\s*"(?:clr-namespace|using):([\w.]+)/g,
      // a merged dictionary or a page, never the image beside it
      /\bSource\s*=\s*"([^"\n]*\.[ax]?xaml)"/gi,
    ],
    // its class is declared by the file behind it, and markup declares nothing of its own
    decls: [],
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
    id: "php", label: "PHP", exts: ["php"], flavour: "php",
    quoted: true,
    imports: [/^[^\S\n]*(?:use|require|require_once|include|include_once)\s*\(?\s*["']?([\w\\/.]+)/gm],
    decls: [
      { kind: "function", re: /(?:^|[\s;}])function\s+([A-Za-z_]\w*)/gm },
      { kind: "class", re: /(?:^|[\s;}])(?:abstract\s+|final\s+)*(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/gm },
    ],
  },
  {
    // an arduino sketch is c++ with a different extension, and cuda is too
    id: "c", label: "C",
    exts: ["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "hxx", "ipp", "inl", "tcc", "ino", "pde", "cu", "cuh"],
    flavour: "c",
    // a quoted include is this project's, an angled one is the toolchain's
    quoted: true,
    imports: [/^[^\S\n]*#\s*include\s*(?:(<)([^>\n]+)>|"([^"\n]+)")/gm],
    // a method sits inside a class, so it is indented, and a header declares without a body
    // prettier-ignore
    decls: [
      { kind: "class", re: /(?:^|[\s;}])(?:struct|class|union|enum)\s+([A-Za-z_]\w*)\s*(?::[^{;]*)?\{/gm },
      { kind: "function", re: /^[^\S\n]*(?:[A-Za-z_~][\w:<>,*&\s]*?[\s*&~])([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\s*(?=\{)/gm },
      // a function shaped macro is called like one, so it declares a name too
      { kind: "function", re: /^[^\S\n]*#\s*define\s+([A-Za-z_]\w*)\s*(?=\()/gm },
      // and a parameter list of types, or `Thing name(1, 2);` reads as one of these
      { kind: "function", re: /^[^\S\n]*(?:[A-Za-z_][\w:<>,*&\s]*?[\s*&])([A-Za-z_]\w*)\s*\((?=\s*(?:void\s*)?\)|[^;{)]*(?:[A-Za-z_][\w:<>]*[\s*&]+[*&]*[A-Za-z_]|\.\.\.))[^;{]*\)\s*(?:const\s*)?(?:noexcept\s*)?;/gm },
    ],
  },
]

const BY_EXT = new Map<string, Dialect>(
  DIALECTS.flatMap((one) => one.exts.map((ext) => [ext, one] as [string, Dialect])),
)

export const dialectOf = (path: string): Dialect | undefined =>
  BY_EXT.get(path.split(".").pop()?.toLowerCase() ?? "")

/** a single file component is javascript inside markup, and only its script is code */
export const SFC = /\.(vue|svelte)$/i

/** how this file is written, which for an sfc is not how the rest of its language is */
export const flavourOf = (path: string): Flavour =>
  SFC.test(path) ? "sfc" : (dialectOf(path)?.flavour ?? "js")

/** every extension desprawl can read a graph out of */
export const READS = new RegExp(`\\.(${[...BY_EXT.keys()].join("|")})$`, "i")

export const LANGUAGES = DIALECTS.map((one) => one.id)

/** where a specifier lands, per language. No build file is read */
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
    // a file is a module, so super::x is a sibling
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
    if (crate !== undefined && head !== "crate") {
      const at = crate.split("/").filter(Boolean)
      return [
        ...spell([...at, ...rest], exts),
        ...spell([...at, ...rest, "mod"], exts),
        ...owner(at),
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
      // the crate holding this file says where its root is, and only a manifest knows that
      const mine = [...parts_.values()]
        .filter((one) => from.startsWith(`${one}/`))
        .sort((a, b) => b.length - a.length)[0]
      const src = from.split("/").lastIndexOf("src")
      const at =
        mine ??
        (src === -1
          ? ""
          : from
              .split("/")
              .slice(0, src + 1)
              .join("/"))
      // and a target a manifest gave its own path, like a test binary, roots at its folder
      return [...reach(at ? at.split("/") : [], rest), ...reach(dir, rest)]
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
    // `from a.b import c` may name the module a/b or the thing c inside a/b
    const ways = (at: string[]) => [
      ...spell(at, exts),
      ...spell([...at, "__init__"], exts),
      ...(parts.length > 1 ? spell(at.slice(0, -1), exts) : []),
    ]
    if (dots) return ways([...up(dots - 1), ...parts])
    // an absolute import names a package, and the folder holding that package is a root
    // nothing writes down: the repo, a service run from its own folder, a workspace member
    const home = parts_.get(parts[0])
    return [
      ...(home === undefined ? [] : ways([...home.split("/"), ...parts.slice(1)])),
      // every folder above the file is a root it could have been run from, nearest first
      ...dir.flatMap((_, at) => ways([...dir.slice(0, dir.length - at), ...parts])),
      ...ways(parts),
    ]
  }

  if (dialect.id === "dart") {
    // `package:name/x.dart` is the lib folder of that package, wherever the package sits
    const named = /^package:([^/]+)\/(.+)$/.exec(text)
    if (named) {
      const home = parts_.get(named[1])
      return home === undefined ? [] : [[home, named[2]].filter(Boolean).join("/")]
    }
    // the sdk is never a file here
    if (text.startsWith("dart:")) return []
    // everything else is written relative to the file that asks for it
    const parts = text.split("/").filter((one) => one && one !== ".")
    const back = parts.filter((one) => one === "..").length
    const held = parts.slice(back)
    return [[...up(back), ...held].join("/"), held.join("/"), ["lib", ...held].join("/")]
  }

  if (dialect.id === "jvm") {
    const parts = text.replace(/\.\*$/, "").split(".").filter(Boolean)
    // `import a.b.*` is every file in that package, the way the compiler reads it
    const all = text.endsWith(".*")
      ? [
          `${parts.join("/")}/`,
          `src/main/kotlin/${parts.join("/")}/`,
          `src/main/java/${parts.join("/")}/`,
          `app/src/main/kotlin/${parts.join("/")}/`,
          `app/src/main/java/${parts.join("/")}/`,
        ]
      : []
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
      ...all,
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

  // a namespace is a folder of types, under whichever project declared its root
  const namespaced = (text_: string): string[] => {
    const parts = text_.split(".").filter(Boolean)
    const home: string[] = []
    for (let at = parts.length; at > 0 && !home.length; at--) {
      const held = parts_.get(parts.slice(0, at).join("."))
      if (held === undefined) continue
      const rest = parts.slice(at)
      const dir = [...held.split("/").filter(Boolean), ...rest]
      home.push(`${dir.join("/")}/`, ...spell(dir, exts))
    }
    return [
      ...home,
      `${parts.join("/")}/`,
      ...spell(parts, exts),
      `src/${parts.join("/")}/`,
      ...spell(["src", ...parts], exts),
    ]
  }

  if (dialect.id === "csharp") return namespaced(text)

  if (dialect.id === "xaml") {
    // a merged dictionary, written as a path, a rooted path, or a pack uri naming an assembly
    if (/[/\\]/.test(text) || /\.[ax]?xaml$/i.test(text)) {
      const held = text
        .replace(/^(?:pack:\/\/[^/]*|ms-appx(?:-web)?:\/\/)\/*/i, "")
        .replace(/^[\w.]+;component\//i, "")
        .replace(/\\/g, "/")
        .split("/")
        .filter((one) => one && one !== ".")
      const back = held.filter((one) => one === "..").length
      const rest = held.slice(back)
      // a resource uri names the assembly first, which is a project rather than a folder
      const tail = rest.length > 1 ? rest.slice(1) : rest
      const homes = [...new Set([parts_.get(rest[0]) ?? "", ...parts_.values()])]
      return [
        [...up(back), ...rest].join("/"),
        rest.join("/"),
        ["src", ...rest].join("/"),
        // a dictionary is merged by a path its own project is the root of
        ...homes.map((home) => [home, ...rest].filter(Boolean).join("/")),
        ...homes.map((home) => [home, ...tail].filter(Boolean).join("/")),
      ]
    }
    // x:Class names the type this markup is the other half of, and that file sits beside it
    // under the same name. Every other name is a namespace, which is a folder like any other
    const base = (from.split("/").pop() ?? "").replace(/\.[ax]?xaml$/i, "")
    const behind = text.split(".").pop() === base ? [`${from}.cs`, `${from}.vb`] : []
    return [...behind, ...namespaced(text)]
  }

  if (dialect.id === "swift" || dialect.id === "php") {
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

/** words the language owns, and what its runtime provides */
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
  dart: {
    keywords: ["abstract", "as", "assert", "async", "await", "base", "break", "case", "catch",
      "class", "const", "continue", "covariant", "default", "deferred", "do", "dynamic", "else",
      "enum", "export", "extends", "extension", "external", "factory", "false", "final", "finally",
      "for", "get", "hide", "if", "implements", "import", "in", "interface", "is", "late",
      "library", "mixin", "new", "null", "on", "operator", "part", "required", "rethrow", "return",
      "sealed", "set", "show", "static", "super", "switch", "sync", "this", "throw", "true", "try",
      "typedef", "var", "void", "when", "while", "with", "yield"],
    // the core library, and the widgets flutter hands every app that never declares them
    runtime: ["print", "String", "int", "double", "num", "bool", "List", "Map", "Set", "Iterable",
      "Future", "Stream", "Object", "DateTime", "Duration", "Uri", "RegExp", "StringBuffer",
      "Exception", "Error", "ArgumentError", "StateError", "identical", "override", "required",
      "add", "addAll", "remove", "contains", "map", "where", "toList", "toSet", "toString",
      "length", "forEach", "then", "catchError", "firstWhere", "join", "split", "substring",
      "indexOf", "trim", "isEmpty", "isNotEmpty", "keys", "values", "expand", "reduce", "fold",
      "sort", "first", "last", "cast", "parse", "tryParse", "jsonDecode", "jsonEncode",
      "Widget", "StatelessWidget", "StatefulWidget", "State", "BuildContext", "Key", "setState",
      "Container", "Column", "Row", "Text", "Scaffold", "Padding", "Center", "SizedBox", "Icon",
      "AppBar", "ListView", "Navigator", "MediaQuery", "Theme", "Colors", "EdgeInsets", "Expanded",
      "Stack", "Positioned", "Align", "Flexible", "Wrap", "Card", "Image", "TextStyle", "runApp"],
  },
  csharp: {
    keywords: ["class", "interface", "struct", "enum", "record", "namespace", "using", "public",
      "private", "protected", "internal", "static", "readonly", "const", "virtual", "override",
      "abstract", "sealed", "partial", "async", "await", "var", "new", "return", "if", "else",
      "for", "foreach", "while", "do", "switch", "case", "break", "continue", "try", "catch",
      "finally", "throw", "null", "true", "false", "this", "base", "get", "set", "void", "in",
      "out", "ref", "params", "global", "event", "delegate", "operator", "implicit", "explicit",
      "extern", "unsafe", "fixed", "stackalloc", "lock", "checked", "unchecked", "goto", "yield",
      "is", "as", "when", "where", "nameof", "typeof", "sizeof", "default", "init", "required",
      "file", "scoped", "with", "and", "or", "not", "add", "remove", "value", "dynamic", "object",
      "string", "int", "bool", "double", "float", "decimal", "long", "short", "byte", "char",
      "sbyte", "uint", "ulong", "ushort", "nint", "nuint", "volatile", "select", "from",
      "join", "let", "orderby", "group", "into", "by", "ascending", "descending", "equals", "on"],
    // the base class library, and what a desktop framework hands every window it loads
    runtime: ["String", "Int32", "Int64", "Double", "Boolean", "Decimal", "Guid", "DateTime",
      "DateTimeOffset", "TimeSpan", "Uri", "Version", "Math", "Convert", "Enum", "Type", "Object",
      "Nullable", "Tuple", "ValueTuple", "KeyValuePair", "List", "Dictionary", "HashSet", "Queue",
      "Stack", "Array", "Span", "Memory", "IEnumerable", "IReadOnlyList", "IList", "ICollection",
      "IDictionary", "IQueryable", "IComparable", "IEquatable", "IDisposable", "IAsyncDisposable",
      "ObservableCollection", "INotifyPropertyChanged", "PropertyChangedEventArgs", "Task",
      "ValueTask", "CancellationToken", "CancellationTokenSource", "Thread", "Interlocked",
      "SemaphoreSlim", "Lazy", "Action", "Func", "Predicate", "EventArgs", "EventHandler",
      "Exception", "ArgumentException", "ArgumentNullException", "InvalidOperationException",
      "NotImplementedException", "NotSupportedException", "Console", "Debug", "Trace", "File",
      "Directory", "Path", "Stream", "StreamReader", "StreamWriter", "MemoryStream", "Encoding",
      "StringBuilder", "Regex", "CultureInfo", "JsonSerializer", "HttpClient", "WriteLine",
      "ToString", "Equals", "GetHashCode", "GetType", "Parse", "TryParse", "Format", "Join",
      "Split", "Substring", "IndexOf", "StartsWith", "EndsWith", "Replace", "Trim", "ToLower",
      "ToUpper", "IsNullOrEmpty", "IsNullOrWhiteSpace", "Select", "SelectMany", "Where", "OrderBy",
      "OrderByDescending", "ThenBy", "GroupBy", "ToList", "ToArray", "ToDictionary", "Count",
      "Any", "All", "First", "FirstOrDefault", "Single", "SingleOrDefault", "Last", "LastOrDefault",
      "Sum", "Average", "Min", "Max", "Skip", "Take", "Distinct", "Concat", "Except", "Union",
      "Contains", "Add", "AddRange", "Remove", "RemoveAt", "Clear", "Insert", "Sort", "Reverse",
      "ContainsKey", "TryGetValue", "ConfigureAwait", "WhenAll", "WhenAny", "FromResult", "Delay",
      "Run", "Dispose", "DisposeAsync",
      // wpf and its neighbours: a code behind calls these and declares none of them
      "InitializeComponent", "DependencyProperty", "DependencyObject", "GetValue", "SetValue",
      "Application", "Window", "UserControl", "Page", "Control", "FrameworkElement", "Dispatcher",
      "RoutedEventArgs", "RoutedEvent", "DataContext", "Visibility", "Thickness", "Brushes",
      "MessageBox", "Binding", "ICommand", "CommandManager", "ObservableObject"],
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
      "explicit", "constexpr", "noexcept", "nullptr", "true", "false", "try", "catch", "throw",
      "defined", "static_cast", "dynamic_cast", "reinterpret_cast", "const_cast", "static_assert",
      "decltype", "alignof", "alignas", "thread_local", "mutable", "override", "final", "concept",
      "requires", "co_await", "co_return", "co_yield", "consteval", "constinit", "typeid"],
    runtime: ["printf", "fprintf", "sprintf", "snprintf", "scanf", "malloc", "calloc", "realloc",
      "free", "memcpy", "memset", "memmove", "strlen", "strcpy", "strncpy", "strcmp", "strncmp",
      "strcat", "fopen", "fclose", "fread", "fwrite", "fseek", "ftell", "exit", "abort", "assert",
      "qsort", "bsearch", "rand", "srand", "time", "clock", "abs", "pow", "sqrt", "floor", "ceil",
      "std", "string", "vector", "cout", "cerr", "cin", "endl", "size", "push_back", "begin", "end"],
  },
}

export const keywordsOf = (lang: string): Set<string> => new Set(OWNED[lang]?.keywords ?? [])
export const runtimeOf = (lang: string): Set<string> => new Set(OWNED[lang]?.runtime ?? [])
