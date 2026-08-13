// owner: finn
// goal: what a licence asks of the code that uses it

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
