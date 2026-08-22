// owner: finn
// goal: the sprawl that is textual rather than structural, which no graph sees

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { VENDORED } from "../read/graph.ts"
import { roleOf } from "../read/layers.ts"
import { specifiers } from "../read/specifiers.ts"

export interface Said {
  text: string
  files: string[]
  times: number
  /** a class list rather than words: same copy, but the cure is a component */
  styled?: true
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
// a class list is how tailwind is written, so it has to be longer and wider to mean anything
const WIDE = 5
const FEW = 4
// a run this long is a decision repeated, not two lines that rhyme
const RUN = 5
// past this a line is boilerplate rather than a place a copy begins
const COMMON = 60

const CODE = /\.(tsx?|jsx?|mts|cts)$/
// a stub beside the thing it stands in for, which no folder name gives away
const MOCK = /(^|\/|\.)(mock|mocks|stub|stubs|fake|fakes|fixture|fixtures)\.[cm]?[jt]sx?$/i
// vendored code is somebody else's copy, and a minified file is one line
const ours = (path: string) =>
  CODE.test(path) && !VENDORED.test(path) && !/\.min\.[jt]s$/.test(path)

// what a utility class is spelled like: a variant or two, then a property and its value
// prettier-ignore
const UTILITY =
  /^(?:(?:hover|focus|focus-visible|active|group|group-hover|peer|peer-focus|dark|first|last|odd|even|disabled|checked|open|sm|md|lg|xl|2xl|print|motion-safe|motion-reduce|rtl|ltr|data-\[[^\]]*\]|aria-\[[^\]]*\]|has-\[[^\]]*\]|max-\w+|min-\w+):)*-?(?:flex|grid|table|block|inline|inline-block|inline-flex|contents|hidden|absolute|relative|fixed|sticky|static|truncate|italic|underline|uppercase|lowercase|capitalize|antialiased|sr-only|group|text|bg|from|via|to|border|divide|ring|outline|shadow|rounded|opacity|font|leading|tracking|decoration|line|list|placeholder|caret|accent|fill|stroke|caption|p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|w|h|size|min|max|gap|space|items|justify|content|self|place|order|col|row|basis|grow|shrink|flex-1|top|left|right|bottom|inset|z|overflow|overscroll|object|aspect|cursor|pointer|select|resize|transition|duration|delay|ease|animate|fade|zoom|slide|spin|transform|translate|rotate|scale|skew|origin|whitespace|break|tabular|align|indent|columns|backdrop|blur|brightness|container|touch|scroll)(?:-|$)/

/** a class list is what an element looks like, not a decision written out twice */
const styled = (text: string): boolean => {
  const parts = text.split(/\s+/)
  return parts.length > 1 && parts.every((one) => UTILITY.test(one))
}

// a placeholder, a hash, a key: written by a machine for a machine
const IDENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{16,}$|^[A-Za-z0-9+/]{24,}={0,2}$/i

/** vector art, hashes, blobs: nobody typed these, so nobody will name them */
const data = (text: string): boolean => {
  if (IDENT.test(text)) return true
  // an svg path is a letter then numbers, over and over
  if (/^[MmLlHhVvCcSsQqTtAaZz][\d\s.,-]/.test(text)) return true
  const digits = (text.match(/[\d\s.,;:%#|/+_-]/g) ?? []).length
  // more digits than letters is a value, not a sentence
  return digits / text.length > 0.6 && !/\s\w+\s\w+\s/.test(text)
}

function saidIn(text: string): string[] {
  const found: string[] = []
  // an import already names the module it asks for
  const asked = new Set(specifiers(text).map((one) => one.text))
  for (const m of text.matchAll(/(["'`])((?:(?!\1)[^\\\n])*)\1/g)) {
    const one = m[2]
    if (one.length < LONG) continue
    // a path or a url is already the name of the thing
    if (/^[./~@]|^https?:|^node:/.test(one)) continue
    if (data(one)) continue
    if (asked.has(one)) continue
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
  return (
    [...seen]
      .map(([text, files]) => ({ text, files, times: files.length, styled: styled(text) }))
      // a string only fixtures repeat is a fixture, whatever it says
      .filter(({ files }) => files.some((one) => roleOf(one) !== "test" && !MOCK.test(one)))
      .filter(({ text, times, styled: look }) =>
        look ? times >= WIDE && text.split(/\s+/).length >= FEW : times >= SPREAD,
      )
      .map(({ text, files, times, styled: look }) =>
        look ? { text, files, times, styled: true as const } : { text, files, times },
      )
      .sort((a, b) => b.times * b.text.length - a.times * a.text.length)
  )
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

/** the same lines in two files, grown as far as they match */
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
  // a run lies on one diagonal, so where each ended is enough
  const ends = new Map<string, number>()
  // each seat against the next, never every pair
  for (const [, seats] of starts) {
    // a line this common is boilerplate, and quadratic without this
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
