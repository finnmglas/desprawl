// owner: finn
// goal: judge kpi numbers

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

/** a folder importing one that imports it back cannot be moved, tested or read apart */
export const tanglesOf = (n: number, units: number): Verdict =>
  n === 0
    ? {
        label: "acyclic",
        tone: "fine",
        why: "no unit here imports one that imports it back, so the levels below are the real order",
      }
    : {
        label: band(n, [
          [2, "one knot"],
          [5, "a few knots"],
          [Infinity, "knotted"],
        ]),
        tone: "watch",
        why: `${n} groups of units import each other in a loop, out of ${units}. Neither side can move, be tested or be understood without the other`,
      }

/** how many steps of dependency separate the entry points from the leaves */
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

/**
 * What opening a folder would show. Both ends say something: a pile of entries with
 * no substructure is the shape sprawl takes, and a group of two or three may not
 * have earned a folder of its own.
 */
export function spreadOf(
  entries: number,
  folders?: number,
  /** a repo root earns more room: config, docs and manifests all live loose in it */
  roomy = false,
): { label: string; tone: string; why: string } {
  const held =
    folders === undefined ? "" : folders ? `, ${folders} of them folders` : " and not one subfolder"
  const allowed = roomy ? ", and a repo root was already allowed more than a folder inside it" : ""

  if (entries >= (roomy ? 100 : 60))
    return {
      label: "bloated",
      tone: "border-red-500/60 text-red-700 dark:text-red-300",
      why: `${entries} entries side by side${held}. This is not a folder any more, it is a directory listing${allowed}`,
    }
  if (entries >= (roomy ? 40 : 26))
    return {
      label: "oversize",
      tone: "border-amber-500/60 text-amber-700 dark:text-amber-300",
      why: `${entries} entries${held}. Past what anyone scans at once, though still a list you could sort out in an afternoon${allowed}`,
    }
  if (entries >= 4)
    return {
      label: "healthy",
      tone: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
      why: `${entries} entries, a folder you can open and take in at once`,
    }
  return {
    label: "thin",
    tone: "text-muted-foreground",
    why: `${entries} entries. Not a problem, but a folder this small may belong inside its neighbour`,
  }
}

export const TONES: Record<Verdict["tone"], string> = {
  plain: "bg-muted text-muted-foreground",
  fine: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  watch: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
}
