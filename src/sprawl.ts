// owner: finn
// goal: the sprawl that is textual rather than structural, which no graph sees

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { VENDORED } from "./graph.ts"

export interface Said {
  text: string
  files: string[]
  times: number
}

export interface Twice {
  lines: string[]
  /** file:line per copy */
  at: string[]
}

// shorter than this and a name costs more than it saves
const LONG = 24
// in this many files before one name is worth it
const SPREAD = 3
// a run this long is a decision repeated, not two lines that rhyme
const RUN = 5
// past this a line is boilerplate rather than a place a copy begins
const COMMON = 60

const CODE = /\.(tsx?|jsx?|mts|cts)$/
// vendored code is somebody else's copy, and a minified file is one line
const ours = (path: string) =>
  CODE.test(path) && !VENDORED.test(path) && !/\.min\.[jt]s$/.test(path)

function saidIn(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(/(["'`])((?:(?!\1)[^\\\n])*)\1/g)) {
    const one = m[2]
    if (one.length < LONG) continue
    // a path or a url is already the name of the thing
    if (/^[./~@]|^https?:|^node:/.test(one)) continue
    found.push(one)
  }
  return found
}

/** one literal in several files: changing it means finding every copy */
export function repeated(repo: string, paths: string[]): Said[] {
  const seen = new Map<string, string[]>()
  for (const path of paths) {
    if (!ours(path)) continue
    let text: string
    try {
      text = readFileSync(join(repo, path), "utf8")
    } catch {
      continue
    }
    for (const one of new Set(saidIn(text))) {
      const files = seen.get(one)
      if (files) files.push(path)
      else seen.set(one, [path])
    }
  }
  return [...seen]
    .filter(([, files]) => files.length >= SPREAD)
    .map(([text, files]) => ({ text, files, times: files.length }))
    .sort((a, b) => b.times * b.text.length - a.times * a.text.length)
}

const bare = (line: string) => line.trim().replace(/\s+/g, " ")

const skip = (line: string) =>
  !line ||
  line.length < 12 ||
  line.startsWith("//") ||
  line.startsWith("*") ||
  line.startsWith("/*") ||
  line.startsWith("import ") ||
  line.startsWith("export ") ||
  /^[)\]}>,;]+$/.test(line)

/** the same lines in two files, grown as far as they match, so one copy is one finding */
export function copied(repo: string, paths: string[]): Twice[] {
  const held = new Map<string, string[]>()
  const starts = new Map<string, [string, number][]>()
  for (const path of paths) {
    if (!ours(path)) continue
    try {
      const lines = readFileSync(join(repo, path), "utf8").split("\n").map(bare)
      held.set(path, lines)
      lines.forEach((line, i) => {
        if (skip(line)) return
        const seats = starts.get(line)
        if (seats) seats.push([path, i])
        else starts.set(line, [[path, i]])
      })
    } catch {
      // unreadable is not copied
    }
  }
  const found: Twice[] = []
  // a run lies on one diagonal of the two files, so where each diagonal ended is enough to
  // know a later start is inside a run already found
  const ends = new Map<string, number>()
  // each seat against the next one in another file, never every pair: a line written ten
  // thousand times would otherwise be fifty million comparisons and no finding at all
  for (const [, seats] of starts) {
    // a line written this often is boilerplate, and any real run through it holds a rarer
    // line to start from. Without this, two files of one repeated line are quadratic
    if (seats.length < 2 || seats.length > COMMON) continue
    for (let a = 0; a < seats.length; a++) {
      const [one, at] = seats[a]
      const b = seats.findIndex((seat, i) => i > a && seat[0] !== one)
      if (b < 0) continue
      const [two, to] = seats[b]
      const line = `${one}|${two}|${at - to}`
      if (at < (ends.get(line) ?? -1)) continue
      const here = held.get(one)!
      const there = held.get(two)!
      // a run that grows backwards is the tail of one that starts earlier
      if (at && to && here[at - 1] === there[to - 1] && !skip(here[at - 1])) continue
      let n = 0
      while (here[at + n] !== undefined && here[at + n] === there[to + n] && !skip(here[at + n]))
        n++
      if (n < RUN) continue
      ends.set(line, at + n)
      found.push({ lines: here.slice(at, at + n), at: [`${one}:${at + 1}`, `${two}:${to + 1}`] })
    }
  }
  return found.sort((a, b) => b.lines.length - a.lines.length)
}

export interface Talky {
  path: string
  /** characters of comment, and of everything */
  said: number
  chars: number
  share: number
}

// a file explaining itself this hard is explaining a design nobody can read
const CHATTY = 0.4
// under this there is not enough prose for a share to mean anything
const ENOUGH = 8000

/** files carrying more comment than the code can bear */
export function talky(repo: string, paths: string[]): Talky[] {
  const found: Talky[] = []
  for (const path of paths) {
    if (!ours(path)) continue
    let lines: string[]
    try {
      lines = readFileSync(join(repo, path), "utf8").split("\n")
    } catch {
      continue
    }
    let said = 0
    let block = false
    for (const raw of lines) {
      const line = raw.trim()
      if (block) {
        said += line.length
        if (line.includes("*/")) block = false
      } else if (line.startsWith("/*")) {
        said += line.length
        block = !line.includes("*/")
      } else if (line.startsWith("//")) said += line.length
    }
    const chars = lines.join("").length
    if (said >= ENOUGH && said / Math.max(1, chars) >= CHATTY)
      found.push({ path, said, chars, share: said / Math.max(1, chars) })
  }
  return found.sort((a, b) => b.said - a.said)
}
