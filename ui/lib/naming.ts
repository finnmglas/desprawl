// owner: finn
// goal: a folder path read as a name a person would use

import { LOOSE_FILES } from "../../src/layers.ts"

// says nothing alone, so it borrows the folder above it
const PLAIN = new Set([
  "lib",
  "libs",
  "utils",
  "util",
  "helpers",
  "common",
  "core",
  "shared",
  "src",
  "app",
  "components",
  "hooks",
  "types",
  "api",
  "config",
  "internal",
  "modules",
  "packages",
  "pages",
  "ui",
])

// a route parameter by these names says only that something varies
const ANY = new Set([
  "id",
  "slug",
  "key",
  "uuid",
  "param",
  "params",
  "name",
  "index",
  "all",
  "path",
])

// written as an acronym everywhere except in a path
const SHOUT = new Set(["ui", "api", "cli", "ai", "css", "html", "js", "ts", "sdk", "http"])

// a folder is named to be typed, a label is read out loud
const SPELLED: Record<string, string> = {
  src: "source",
  lib: "library",
  libs: "libraries",
  util: "utility",
  utils: "utilities",
  dep: "dependency",
  deps: "dependencies",
  config: "configuration",
  configs: "configurations",
  doc: "documentation",
  docs: "documentation",
  spec: "specification",
  specs: "specifications",
  impl: "implementation",
  env: "environment",
  pkg: "package",
  pkgs: "packages",
  msg: "message",
  msgs: "messages",
  pref: "preference",
  prefs: "preferences",
  db: "database",
  auth: "authentication",
}

const said = (part: string) =>
  part
    .replace(/^[([]+/, "")
    .replace(/[)\]]+$/, "")
    .replace(/^\.{3}/, "")
    .replace(/[-_.]+/g, " ")
    .trim()

const cased = (phrase: string) =>
  phrase
    .split(" ")
    .filter(Boolean)
    .map((raw, i) => {
      const word = SPELLED[raw.toLowerCase()] ?? raw
      if (SHOUT.has(word.toLowerCase())) return word.toUpperCase()
      return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    })
    .join(" ")

/** a hash or uuid: chunks of letters and digits, none of them a word */
export function isId(segment: string): boolean {
  const parts = segment.split(/[-_]/)
  if (parts.length < 3) return false
  const coded = parts.filter((p) => p.length >= 4 && /^[a-z0-9]+$/i.test(p) && /\d/.test(p))
  return coded.length >= parts.length - 1
}

const VARIES = /^\[.+\]$/

/**
 * What a group would be called out loud. A remainder says whether opening it shows
 * folders or files, a route parameter is named for what it is a detail of, and an id
 * is left exactly as written since only its characters tell two of them apart.
 */
export function nameOf(path: string, folders = 0, deep = false): string {
  if (path === LOOSE_FILES) return "Repo root [files]"
  const parts = path.split("/")
  const rest = parts.at(-1) === LOOSE_FILES
  const own = parts.at(rest ? -2 : -1) ?? path
  const above = parts.at(rest ? -3 : -2) ?? ""

  if (isId(own)) return own

  if (VARIES.test(own)) {
    // `[course_id]` is a course, `[slug]` and any catch all are only what the folder above holds
    const inner = said(own)
      .replace(/\s*id$/i, "")
      .trim()
    const every = /^\[+\.{3}/.test(own)
    const named = every || !inner || ANY.has(inner.toLowerCase()) ? said(above) : inner
    return `${cased(named) || "One"} [detail]`
  }

  const word = said(own)
  const borrows = above && (deep || PLAIN.has(word.toLowerCase()))
  return (
    cased(borrows ? `${said(above)} ${word}` : word) +
    (rest ? (folders ? " [modules]" : " [files]") : "")
  )
}

/** two groups called the same thing is worse than one long name, so only a clash grows */
export function namesOf(units: { path: string; folders: number }[]): Map<string, string> {
  const names = new Map(units.map((u) => [u.path, nameOf(u.path, u.folders)]))
  const taken = new Map<string, string[]>()
  for (const [path, name] of names) taken.set(name, [...(taken.get(name) ?? []), path])
  for (const paths of taken.values()) {
    if (paths.length < 2) continue
    for (const path of paths) {
      const unit = units.find((u) => u.path === path)!
      names.set(path, nameOf(path, unit.folders, true))
    }
  }
  return names
}
