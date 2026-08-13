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

const cased = (phrase: string) => {
  const words = phrase.split(" ").filter(Boolean)
  // `app_ui/ui` borrows the folder above and lands on "app ui ui": a word the rest of the
  // name already says is said once, and it is the later one that keeps its place
  return words
    .filter(
      (word, i) => !words.slice(i + 1).some((later) => later.toLowerCase() === word.toLowerCase()),
    )
    .map((raw, i) => {
      const word = SPELLED[raw.toLowerCase()] ?? raw
      if (SHOUT.has(word.toLowerCase())) return word.toUpperCase()
      return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    })
    .join(" ")
}

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
 * `deep` is how many folders a clash has had to climb, and every step adds one.
 */
export function nameOf(path: string, folders = 0, deep = 0): string {
  if (path === LOOSE_FILES) return "Repo root [files]"
  const parts = path.split("/")
  const rest = parts.at(-1) === LOOSE_FILES
  const own = parts.at(rest ? -2 : -1) ?? path
  const above = parts
    .slice(0, rest ? -2 : -1)
    .map(said)
    .filter(Boolean)
  // `apps/admin/src/modules` is admin's, not another src's, so a borrow skips what says nothing
  const speaks = above.filter((w) => !PLAIN.has(w.toLowerCase()))

  if (isId(own)) return own

  if (VARIES.test(own)) {
    // `[course_id]` is a course, `[slug]` and any catch all are only what the folder above holds
    const inner = said(own)
      .replace(/\s*id$/i, "")
      .trim()
    const every = /^\[+\.{3}/.test(own)
    const holds = speaks.at(-1) ?? above.at(-1) ?? ""
    const named = every || !inner || ANY.has(inner.toLowerCase()) ? holds : inner
    return `${cased(named) || "One"} [detail]`
  }

  const word = said(own)
  const plain = PLAIN.has(word.toLowerCase())
  const borrowed = deep
    ? above.slice(-deep)
    : plain
      ? [speaks.at(-1) ?? above.at(-1)].filter(Boolean)
      : []
  const name = cased([...borrowed, word].join(" "))
  if (!rest) return name
  // the tag already says modules, so `Admin modules [modules]` says it twice
  const tag = folders ? "modules" : "files"
  const words = name.split(" ")
  const short = words.at(-1)?.toLowerCase() === tag ? words.slice(0, -1).join(" ") : name
  return `${short || name} [${tag}]`
}

/** two groups called the same thing is worse than one long name, so only a clash grows */
export function namesOf(units: { path: string; folders: number }[]): Map<string, string> {
  const folders = new Map(units.map((u) => [u.path, u.folders]))
  const names = new Map(units.map((u) => [u.path, nameOf(u.path, u.folders)]))
  // one folder per round, until the last one that could tell them apart has been said
  for (let deep = 1; ; deep++) {
    const taken = new Map<string, string[]>()
    for (const [path, name] of names) taken.set(name, [...(taken.get(name) ?? []), path])
    const clashing = [...taken.values()].filter((paths) => paths.length > 1).flat()
    if (!clashing.length) break
    // `a-b` and `a_b` are read the same however far it climbs, so the path becomes the name
    const spent = deep > 8
    for (const path of clashing)
      names.set(path, spent ? path : nameOf(path, folders.get(path), deep))
    if (spent) break
  }
  return names
}
