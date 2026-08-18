// owner: finn
// goal: files to loc

import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs"
import { join } from "node:path"
import { blank, git } from "./model.ts"
import type { Node, Split } from "./model.ts"
export { LANGS } from "./langs.ts"
import { JS, LANGS, TS } from "./langs.ts"

// named, not extended
// prettier-ignore
export const NAMES: Record<string, string> = {
  makefile: "Make", "gnumakefile": "Make", dockerfile: "Docker", containerfile: "Docker",
  justfile: "just", rakefile: "Ruby", gemfile: "Ruby", brewfile: "Ruby", vagrantfile: "Ruby",
  jenkinsfile: "Groovy", procfile: "Procfile", "cmakelists.txt": "CMake",
}

// binaries carry no lines, but a repo holding them is worth seeing
// prettier-ignore
const DOCS: Record<string, string> = {
  pdf: "PDF", doc: "Word", docx: "Word", odt: "Word", rtf: "Word",
  xls: "Excel", xlsx: "Excel", xlsm: "Excel", ods: "Excel",
  ppt: "PowerPoint", pptx: "PowerPoint", odp: "PowerPoint",
  png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", webp: "Image", ico: "Image",
  bmp: "Image", tiff: "Image", avif: "Image", heic: "Image",
  mp4: "Video", mov: "Video", avi: "Video", webm: "Video", mkv: "Video",
  mp3: "Audio", wav: "Audio", flac: "Audio", ogg: "Audio", m4a: "Audio",
  zip: "Archive", tar: "Archive", gz: "Archive", tgz: "Archive", bz2: "Archive",
  "7z": "Archive", rar: "Archive", xz: "Archive",
  ttf: "Font", otf: "Font", woff: "Font", woff2: "Font", eot: "Font",
  psd: "Design", ai: "Design", sketch: "Design", fig: "Design", xd: "Design",
  exe: "Binary", dll: "Binary", so: "Binary", dylib: "Binary", bin: "Binary", o: "Binary",
  class: "Binary", jar: "Binary", pyc: "Binary", wasm: "WebAssembly",
  db: "Database", sqlite: "Database", sqlite3: "Database", mdb: "Database",
}

// the other way a file says what it is
const RUNS: Record<string, string> = {
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  python: "Python",
  python3: "Python",
  node: "JavaScript",
  ruby: "Ruby",
  perl: "Perl",
}

const shebang = (text: string): string => {
  const first = text.slice(0, 120)
  if (!first.startsWith("#!")) return ""
  return RUNS[first.match(/\b(fish|bash|zsh|sh|python3?|node|ruby|perl)\b/)?.[1] ?? ""] ?? ""
}

const PEEK = 8192

/** null in the head = binary */
function head(file: string): Buffer | null {
  let fd = -1
  try {
    // a symlink to a fifo blocks forever on open, and a device is not source either
    if (!statSync(file).isFile()) return null
    fd = openSync(file, "r")
    const buf = Buffer.alloc(PEEK)
    const read = readSync(fd, buf, 0, PEEK, 0)
    return buf.subarray(0, read)
  } catch {
    return null
  } finally {
    if (fd >= 0) closeSync(fd)
  }
}

// languages a project can be written in. Assets, data and config are counted but never
// name the repo, or a folder of generated svg would decide what the project is
// prettier-ignore
export const CODE = new Set([
  TS, JS, "Rust", "Python", "Go", "Ruby", "Java", "Kotlin", "C", "C++", "C#", "Swift", "PHP",
  "Shell", "Vue", "Svelte", "Perl", "Groovy",
])

const HASH = new Set(["Python", "Shell", "YAML", "TOML", "Ruby", "Make", "Docker", "just"])
const MARKUP = new Set(["HTML", "Markdown", "Vue", "Svelte", "xml"])

// tab or 2 spaces
function nesting(raw: string): number {
  let width = 0
  for (const ch of raw) {
    if (ch === " ") width += 1
    else if (ch === "\t") width += 2
    else break
  }
  return width >> 1
}

// hash langs: docstrings read as code
function classify(text: string, lang: string): Split {
  const hash = HASH.has(lang)
  const [open, close] = MARKUP.has(lang) ? ["<!--", "-->"] : ["/*", "*/"]
  const solo = hash ? "#" : "//"
  const split: Split = { code: 0, comment: 0, blank: 0, indent: 0 }
  let inBlock = false

  // a trailing newline ends the last line, it does not start a blank one
  const lines = text ? text.split("\n") : []
  if (lines.at(-1) === "") lines.pop()

  for (const raw of lines) {
    const line = raw.trim()
    if (inBlock) {
      split.comment++
      if (line.includes(close)) inBlock = false
    } else if (!line) {
      split.blank++
    } else if (line.startsWith(solo)) {
      split.comment++
    } else if (!hash && line.startsWith(open)) {
      split.comment++
      inBlock = !line.includes(close)
    } else {
      split.code++
      split.indent += nesting(raw)
    }
  }
  return split
}

export function scan(repo: string): Node[] {
  const files: Node[] = []

  for (const path of git(repo, "ls-files", "-z").split("\0").filter(Boolean)) {
    const dot = path.lastIndexOf(".")
    const slash = path.lastIndexOf("/")
    const ext = dot > slash + 1 ? path.slice(dot + 1).toLowerCase() : ""

    const file = join(repo, path)
    // submodule, symlink and raced delete all come back null
    const peek = head(file)
    if (!peek) continue

    // a document has no lines to count, but it is still a file the repo carries
    if (peek.includes(0)) {
      const kind = DOCS[ext]
      if (kind)
        files.push({ ...blank(path.slice(slash + 1), path), lang: kind, files: 1, langs: {} })
      continue
    }

    // a name we know beats an extension, or CMakeLists.txt would be txt
    const named = NAMES[path.slice(slash + 1).toLowerCase()]
    const lang = named ?? (ext ? (LANGS[ext] ?? ext) : shebang(peek.toString("utf8")))
    if (!lang) continue

    let text: string
    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue // too large to hold as a string
    }
    const split = classify(text, lang)
    files.push({
      ...blank(path.slice(slash + 1), path),
      lang,
      files: 1,
      chars: text.length,
      ...split,
      langs: { [lang]: split.code },
    })
  }
  return files
}
