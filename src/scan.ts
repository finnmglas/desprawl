// owner: finn
// goal: files to loc

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { blank, git } from "./model.ts"
import type { Node, Split } from "./model.ts"

const ts = "TypeScript"
const js = "JavaScript"

const LANGS: Record<string, string> = {
  ts, tsx: ts, mts: ts, cts: ts,
  js: js, jsx: js, mjs: js, cjs: js,
  rs: "Rust", py: "Python", go: "Go", rb: "Ruby", java: "Java", kt: "Kotlin",
  c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++", cs: "C#", swift: "Swift", php: "PHP",
  css: "CSS", scss: "SCSS", html: "HTML", vue: "Vue", svelte: "Svelte",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", sql: "SQL", prisma: "Prisma",
  md: "Markdown", sh: "Shell", bash: "Shell", flow: "Flow",
}

const HASH = new Set(["Python", "Shell", "YAML", "TOML", "Ruby"])
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

  for (const raw of text.split("\n")) {
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

// tracked only
export function scan(repo: string): Node[] {
  const files: Node[] = []

  for (const path of git(repo, "ls-files", "-z").split("\0").filter(Boolean)) {
    const dot = path.lastIndexOf(".")
    const slash = path.lastIndexOf("/")
    const ext = dot > slash + 1 ? path.slice(dot + 1).toLowerCase() : ""
    if (!ext) continue

    let buf: Buffer
    try {
      buf = readFileSync(join(repo, path))
    } catch {
      continue // submodule, symlink, raced delete
    }
    // NUL in first 8 KB means binary
    if (buf.subarray(0, 8192).includes(0)) continue

    const lang = LANGS[ext] ?? ext
    const text = buf.toString("utf8")
    const split = classify(text, lang)
    files.push({
      ...blank(path.slice(slash + 1), path), lang, files: 1, chars: text.length,
      ...split, langs: { [lang]: split.code },
    })
  }
  return files
}
