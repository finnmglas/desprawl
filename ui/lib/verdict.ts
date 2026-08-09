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

export const TONES: Record<Verdict["tone"], string> = {
  plain: "bg-muted text-muted-foreground",
  fine: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  watch: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
}
