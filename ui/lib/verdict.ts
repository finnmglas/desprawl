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

/** what opening it shows: a pile, or too small to be a folder */
export function spreadOf(
  entries: number,
  folders?: number,
  /** a root earns more room: config and docs live loose in it */
  roomy = false,
): { label: string; tone: string; why: string } {
  const held =
    folders === undefined ? "" : folders ? `, ${folders} of them folders` : " and not one subfolder"
  const allowed = roomy ? ", and a repo root was already allowed more than a folder inside it" : ""

  if (entries >= (roomy ? 100 : 60))
    return {
      label: "bloated",
      tone: OUTLINE.bad,
      why: `${entries} entries side by side${held}. This is not a folder any more, it is a directory listing${allowed}`,
    }
  if (entries >= (roomy ? 40 : 26))
    return {
      label: "oversize",
      tone: OUTLINE.warn,
      why: `${entries} entries${held}. Past what anyone scans at once, though still a list you could sort out in an afternoon${allowed}`,
    }
  if (entries >= 4)
    return {
      label: "healthy",
      tone: OUTLINE.good,
      why: `${entries} entries, a folder you can open and take in at once`,
    }
  return {
    label: "thin",
    tone: OUTLINE.quiet,
    why: `${entries} entries. Not a problem, but a folder this small may belong inside its neighbour`,
  }
}

export interface Shape {
  label: string
  band: "entry" | "middle" | "base"
  tone: string
  why: string
  /** no single import could move it elsewhere, so the label is not a coin flip */
  sure: boolean
  /** what it was decided on, so four imports never read like four thousand */
  edges: number
}

/** imports only itself: a module. Otherwise placed by which way its edges lean */
function read(
  inside: number,
  out: number,
  into: number,
  reach: number,
): Omit<Shape, "sure" | "edges"> & { firm?: boolean } {
  // a hue per shape, a star its neighbour: near misses read near, never the same
  const { good: MODULE, near: NEAR, cool: FLOOR, even: EVEN, warn: MIDDLE } = OUTLINE
  const { entry: ENTRY, top: TOP } = OUTLINE
  if (!inside && !out)
    return {
      label: "Module",
      band: "base",
      tone: MODULE,
      firm: true,
      why: into
        ? "it imports nothing at all and the rest imports it, so it stands on its own"
        : "it imports nothing and nothing imports it, so it stands apart from the repo",
    }
  const kept = (inside / (inside + out)) * 100

  if (kept >= 100)
    return {
      label: "Module",
      band: "base",
      tone: MODULE,
      firm: true,
      why: "every import stays inside it, so it can be lifted out as it stands",
    }
  if (kept >= 80)
    return {
      label: "Module*",
      band: "base",
      tone: NEAR,
      why: "four imports in five stay inside. A module once the last few are dealt with",
    }

  // everything left is placed by which way it leans, so nothing turns on one import
  const arriving = into + out ? (into / (into + out)) * 100 : 0
  if (arriving >= 55)
    return {
      label: "Shared",
      band: "base",
      tone: FLOOR,
      why: `${Math.round(arriving)}% of its edges arrive, so it is what the rest stands on`,
    }
  // half of it is its own and it leans on one group: a leaf hanging off the tree, and
  // nothing importing it means unused, never a top of the stack
  if (kept >= 50 && reach <= 1)
    return {
      label: "Module*",
      band: "base",
      tone: NEAR,
      why: `half its imports stay inside and it leans on ${reach ? "one other group" : "nothing"}, so it is a leaf. Almost nothing here uses it`,
    }
  if (arriving <= 0)
    return {
      label: "Entrypoint",
      band: "entry",
      tone: ENTRY,
      firm: true,
      why: "nothing here imports it, and it imports the rest. A top of the stack",
    }
  if (arriving < 10)
    return {
      label: "Entrypoint*",
      band: "entry",
      tone: TOP,
      why: `${Math.round(arriving)}% of its edges arrive, the rest leave, so it mostly composes`,
    }
  if (arriving < 45)
    return {
      label: "Collection",
      band: "middle",
      tone: MIDDLE,
      why: `${Math.round(arriving)}% of its edges arrive, so it leans on more than leans on it. Hard to move or to name`,
    }
  return {
    label: "Shared*",
    band: "middle",
    tone: EVEN,
    why: `${Math.round(arriving)}% of its edges arrive, which is even. Nearly a foundation, and it would take little to make it one`,
  }
}

/**
 * The shape, and whether it is worth trusting. A label decided on four imports sits a
 * single import away from another one, which is checked rather than guessed at from a
 * sample size: move one import each way and see whether the answer holds.
 */
export function shapeOf(inside: number, out: number, into = 0, reach = 2): Shape {
  const { firm, ...shape } = read(inside, out, into, reach)
  const less = (n: number) => Math.max(0, n - 1)
  const nearby = [
    read(inside + 1, less(out), into, reach),
    read(less(inside), out + 1, into, reach),
    read(inside, out + 1, less(into), reach),
    read(inside, less(out), into + 1, reach),
  ]
  return {
    ...shape,
    // an exact answer is not a near miss: nothing imports it, or nothing leaves it
    sure: !!firm || nearby.every((one) => one.label === shape.label),
    edges: inside + out + into,
  }
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

// by what they ask of the code around them. Prefix matches, since one package writes
// "MIT", another "MIT License", another "MIT-0"
// prettier-ignore
const PERMISSIVE =
  /^(MIT|ISC|0BSD|BSD|Apache|Unlicense|CC0|CC-BY(?!-(NC|ND|SA))|WTFPL|OFL|SIL|Zlib|Libpng|libtiff|Python-2|PSF|BlueOak|X11|NCSA|AFL|UPL|BSL-1|Boost|PostgreSQL|Zope|HPND|FTL|IJG|bzip2|curl|W3C|Ruby|TCL|JSON|Unicode|ICU|Beerware|OpenSSL|ODC-By|PDDL|CeCILL-B|Intel|MirOS|Xnet|AAL)/i
// prettier-ignore
const WEAK =
  /^(LGPL|MPL|EPL|CDDL|CeCILL-C|Artistic|MS-PL|MS-RL|CPL|IPL|APSL|QPL|SPL|NPL|Nokia|SISSL|CC-BY-SA|ODbL)/i
// prettier-ignore
const STRONG =
  /^(GPL|AGPL|SSPL|OSL|RPL|RPSL|EUPL|CeCILL|Sleepycat|Watcom|GFDL|CC-BY-N|Elastic|BUSL|Commons-Clause|PolyForm|Prosperity|Parity|CAL-1|Hippocratic|Fair-Source|FSL|RSAL|Confluent)/i
/** npm's word for "nobody licensed this to you" */
const CLOSED = /^(UNLICENSED|Proprietary|Commercial|Closed|All[- ]Rights[- ]Reserved|Private)/i

export type Family = "permissive" | "weak" | "strong" | "closed" | "unknown"

// gentlest first: an OR takes the lowest of these and an AND the highest
const ORDER: Family[] = ["permissive", "weak", "strong", "closed", "unknown"]

// closed comes first: UNLICENSED starts with a licence that means the opposite
const one = (said: string): Family =>
  CLOSED.test(said)
    ? "closed"
    : PERMISSIVE.test(said)
      ? "permissive"
      : WEAK.test(said)
        ? "weak"
        : STRONG.test(said)
          ? "strong"
          : "unknown"

const worstOf = (parts: string[]) =>
  parts.map(one).reduce((a, b) => (ORDER.indexOf(a) > ORDER.indexOf(b) ? a : b))

/** what it asks of the code using it: a fact, not a verdict */
export const familyOf = (license: string): Family => {
  const said = license.trim().replace(/^the\s+/i, "")
  if (!said) return "unknown"
  // an either takes the gentler side, a both takes the stricter
  return said
    .split(/\s+OR\s+/i)
    .map((part) =>
      worstOf(
        part
          .split(/\s+AND\s+/i)
          .map((bit) => bit.replace(/[()]/g, "").trim())
          .filter(Boolean),
      ),
    )
    .reduce((a, b) => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b))
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
