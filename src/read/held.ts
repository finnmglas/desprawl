// owner: finn
// goal: one read and one scrub per file per run, since four stages want the same bytes

import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { scrub } from "./specifiers.ts"
import type { Flavour } from "./dialects.ts"

type Done = ReturnType<typeof scrub>

interface Held {
  /** what the file was when it was read, so an edit under a live server is never served */
  when: number
  text: string
  done: Map<string, Done>
}

// a kernel is a gigabyte of text, so what is held is bounded and everything past it is
// read again. A repo that fits pays for one read and one scrub, whichever stage asks first
const LIMIT = 128_000_000

const held = new Map<string, Held>()
let chars = 0

function of(path: string): Held | null {
  // one stage says the repo the way the reader typed it and another says its git root,
  // and two spellings of one file is how a cache holds everything and hits nothing
  const file = resolve(path)
  let when: number
  try {
    when = statSync(file).mtimeMs
  } catch {
    return null
  }
  const seen = held.get(file)
  if (seen) {
    if (seen.when === when) return seen
    chars -= seen.text.length
    held.delete(file)
  }
  let text: string
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return null
  }
  const one: Held = { when, text, done: new Map() }
  if (chars + text.length <= LIMIT) {
    held.set(file, one)
    chars += text.length
  }
  return one
}

/** the file as written, or "" where there is nothing to read */
export const reading = (file: string): string => of(file)?.text ?? ""

/** and with its comments and strings taken out, which is what every reader wants */
export function scrubbed(file: string, flavour: Flavour = "js", templates = false): Done {
  const one = of(file)
  if (!one) return { code: "", strings: [] }
  const key = `${flavour}${templates ? "!" : ""}`
  const seen = one.done.get(key)
  if (seen) return seen
  const made = scrub(one.text, flavour, templates)
  one.done.set(key, made)
  return made
}

/** between repos, and between one run and the next: nothing here outlives a reading */
export function forget(): void {
  held.clear()
  chars = 0
}
