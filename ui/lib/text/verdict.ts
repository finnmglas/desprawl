// owner: finn
// goal: judge kpi numbers

export { familyOf, type Family } from "../../../src/facts/licence.ts"
import { shapeOf as shaped, spread } from "../../../src/read/shapes.ts"
export type { Shape } from "../../../src/read/shapes.ts"

export interface Verdict {
  /** one or two words, shown in the corner of the card */
  label: string
  /** grey says only how big, blue says it is fine, amber says look at it */
  tone: "plain" | "fine" | "watch"
  why: string
}

const band = (n: number, steps: [number, string][]): string =>
  steps.find(([limit]) => n < limit)?.[1] ?? steps[steps.length - 1][1]

/** magnitude only, because there is no good or bad amount of code */
export const sizeOf = (loc: number): Verdict => ({
  label: band(loc, [
    [1_000, "tiny"],
    [10_000, "small"],
    [100_000, "sizeable"],
    [1_000_000, "medium"],
    [10_000_000, "large"],
    [100_000_000, "huge"],
    [Infinity, "enormous"],
  ]),
  tone: loc < 10_000 ? "plain" : "fine",
  why: "how much code there is, nothing more. Under 10k reads as small, past a million a repo is its own world",
})

export const historyOf = (commits: number): Verdict => ({
  label: band(commits, [
    [100, "new"],
    [1_000, "young"],
    [10_000, "established"],
    [1_000_000, "long lived"],
    [Infinity, "ultra big"],
  ]),
  tone: commits < 1_000 ? "plain" : "fine",
  why: "how much history there is to read, not how good it is",
})

/** the one number here that can actually be off */
export function commentsOf(comment: number, source: number): Verdict {
  // nothing to comment is not a comment problem
  if (!source)
    return { label: "no source", tone: "plain", why: "there are no source lines to comment" }
  const share = comment / source
  if (share < 0.02)
    return {
      label: "sparse",
      tone: "watch",
      why: "under 2% of source, so intent lives only in the code",
    }
  if (share > 0.15)
    return {
      label: "chatty",
      tone: "watch",
      why: "over 15% of source, which usually means commented out code or generated headers",
    }
  return { label: "normal", tone: "fine", why: "between 2% and 15% of source, the usual band" }
}

/** tokens against what a model can hold at once */
export const contextOf = (tokens: number): Verdict => ({
  label: band(tokens, [
    [200_000, "one context"],
    [1_000_000, "a few contexts"],
    [Infinity, "many contexts"],
  ]),
  tone: tokens < 1_000_000 ? "fine" : "plain",
  why: "roughly how many model contexts the whole repo would fill, at four characters a token",
})

/** a file that imports its own importer cannot be moved, tested or read apart */
export const tanglesOf = (n: number, files: number): Verdict =>
  n === 0
    ? {
        label: "acyclic",
        tone: "fine",
        why: "no file here imports one that imports it back, so the levels below are the real order",
      }
    : {
        label: band(n, [
          [2, "one knot"],
          [5, "a few knots"],
          [Infinity, "knotted"],
        ]),
        tone: "watch",
        why: `${n} rings of files import each other, out of ${files}. Counted on the files themselves, so no grouping invented them`,
      }

/** steps from the entry points to the leaves */
export const layeringOf = (levels: number, units: number): Verdict =>
  units > 3 && levels < 3
    ? {
        label: "flat",
        tone: "plain",
        why: "almost everything sits at the same depth, so the folders carry no order of their own",
      }
    : {
        label: band(levels, [
          [4, "shallow"],
          [8, "layered"],
          [Infinity, "deep"],
        ]),
        tone: levels < 8 ? "fine" : "plain",
        why: "the longest chain of units that depend on each other. Deep is not worse, it is further to trace",
      }

/** the same band, with the colour a badge wants */
export const spreadOf = (entries: number, folders?: number, roomy = false) => {
  const band = spread(entries, folders, roomy)
  const tone = {
    bloated: OUTLINE.bad,
    oversize: OUTLINE.warn,
    healthy: OUTLINE.good,
    thin: OUTLINE.quiet,
  }
  return { ...band, tone: tone[band.label] }
}

/** the colour without the border, for words rather than a badge */
export const INK: Record<string, string> = {
  bloated: "text-red-700 dark:text-red-300",
  oversize: "text-amber-700 dark:text-amber-300",
  healthy: "text-emerald-700 dark:text-emerald-300",
  thin: "text-muted-foreground",
}

/** a file on the same four bands as a folder, read in lines */
export function lengthOf(code: number): { label: string; why: string; tone: string } {
  const band =
    code >= 800
      ? {
          label: "bloated",
          why: `${code} lines of code in one file. Nobody holds this in their head, and every change to it meets everyone else's`,
        }
      : code >= 400
        ? {
            label: "oversize",
            why: `${code} lines of code. Past what is read in one sitting, though still one thing you could split in an afternoon`,
          }
        : code >= 30
          ? {
              label: "healthy",
              why: `${code} lines of code, a file you can open and take in at once`,
            }
          : {
              label: "thin",
              why: `${code} lines of code. Not a problem, but a file this small may belong inside its neighbour`,
            }
  return { ...band, tone: INK[band.label] }
}

/** an outlined badge, one colour per meaning, spelled once for every panel */
export const OUTLINE = {
  bad: "border-red-500/60 text-red-700 dark:text-red-300",
  warn: "border-amber-500/60 text-amber-700 dark:text-amber-300",
  good: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  cool: "border-sky-500/50 text-sky-700 dark:text-sky-300",
  near: "border-lime-500/60 text-lime-700 dark:text-lime-300",
  even: "border-cyan-500/50 text-cyan-700 dark:text-cyan-300",
  entry: "border-violet-500/50 text-violet-700 dark:text-violet-300",
  top: "border-fuchsia-500/50 text-fuchsia-700 dark:text-fuchsia-300",
  quiet: "text-muted-foreground",
}

export const TONES: Record<Verdict["tone"], string> = {
  plain: "bg-muted text-muted-foreground",
  fine: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  watch: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
}

export const RANK = ["CRITICAL", "HIGH", "MODERATE", "LOW"]

/** the worst filed against a package */
export const worst = (found: { severity: string }[]): string =>
  RANK.find((one) => found.some((a) => a.severity === one)) ?? (found.length ? "UNKNOWN" : "")

/** the same shape, with the colour a badge wants */
const HUE: Record<string, string> = {
  Module: OUTLINE.good,
  "Module*": OUTLINE.near,
  Shared: OUTLINE.cool,
  Even: OUTLINE.even,
  Middle: OUTLINE.warn,
  Entry: OUTLINE.entry,
  Top: OUTLINE.top,
}

export const shapeOf = (inside: number, out: number, into = 0, reach = 2) => {
  const shape = shaped(inside, out, into, reach)
  return { ...shape, tone: HUE[shape.label] ?? HUE[shape.label.replace("*", "")] ?? OUTLINE.quiet }
}

/** how covered is covered enough, in the bands every team argues about anyway */
export const coverageOf = (pct: number): Verdict =>
  pct >= 80
    ? { label: "well covered", tone: "fine", why: `${pct}% of lines run under the suite` }
    : pct >= 50
      ? {
          label: "partly covered",
          tone: "plain",
          why: `${pct}% of lines run, half the file tree is dark`,
        }
      : {
          label: "thin",
          tone: "watch",
          why: `${pct}% of lines run, so most of it is never exercised`,
        }

/** dead code is still read, moved and merged, so its share is the cost */
export const deadOf = (lines: number, whole: number): Verdict =>
  !lines
    ? { label: "none", tone: "fine", why: "every declaration is reached by something that runs" }
    : lines / Math.max(1, whole) < 0.05
      ? {
          label: "a corner",
          tone: "plain",
          why: `${((lines / whole) * 100).toFixed(1)}% of declared lines, small enough to be leftovers`,
        }
      : {
          label: "a share",
          tone: "watch",
          why: `${((lines / whole) * 100).toFixed(1)}% of declared lines nothing arrives at, which is read and maintained anyway`,
        }

/** green or not, and the count says how much that means */
export const suiteOf = (ran: { ok: boolean } | null, cases: number): Verdict =>
  !ran
    ? {
        label: "not run",
        tone: "plain",
        why: `${cases} cases found by reading, none run from here`,
      }
    : ran.ok
      ? { label: "green", tone: "fine", why: `every one of the ${cases} cases passed` }
      : { label: "red", tone: "watch", why: "the suite exited with a failure" }
