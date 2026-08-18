#!/usr/bin/env node
// owner: finn
// goal: render stats

import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { getHeapStatistics } from "node:v8"
import { analyze } from "./facts/analyze.ts"
import { fleet, many } from "./facts/many.ts"
import { check } from "./facts/check.ts"
import { deps, joined } from "./facts/deps.ts"
import { merged, tests } from "./facts/tests.ts"
import { human, nest, pct, tokens } from "./facts/human.ts"
import { VERSION, blank, git, merge } from "./read/model.ts"
import { explain, needs } from "./facts/needs.ts"
import { isUrl, local } from "./serve/remote.ts"
import { serve } from "./serve/serve.ts"
import { anonymous, hidden, open, view } from "./serve/view.ts"
import { GRAINS, IMPACTS, KINDS, LANGUAGES, VIEWS, views } from "./facts/views.ts"
import { grainOf } from "./facts/knowledge.ts"
import type { Hits, Sort, View } from "./facts/views.ts"
import type { Node, Split, Stats } from "./read/model.ts"

const fail = (err: unknown): never => {
  const said = typeof err === "string" ? err : explain(err)
  console.error(`desprawl: ${said ?? (err instanceof Error ? err.message.trim() : err)}`)
  return process.exit(1)
}

// parseArgs throws on a malformed flag
const { values, positionals } = (() => {
  try {
    return parseArgs({
      options: {
        json: { type: "boolean", default: false },
        top: { type: "string", default: "10" },
        digits: { type: "string", default: "3" },
        depth: { type: "string", default: "1" },
        commits: { type: "string" },
        raw: { type: "boolean", default: false },
        static: { type: "boolean", default: false },
        anon: { type: "boolean", default: false },
        out: { type: "string" },
        base: { type: "string" },
        repo: { type: "string" },
        keep: { type: "boolean", default: false },
        // set by a disconnected tab's own copied reconnect command, never typed by hand
        token: { type: "string" },
        port: { type: "string" },
        kind: { type: "string" },
        impact: { type: "string" },
        limit: { type: "string" },
        offline: { type: "boolean", default: false },
        grain: { type: "string" },
        lang: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
    })
  } catch (err) {
    return fail(err)
  }
})()

if (values.help) {
  console.log(
    [
      "desprawl [cli|view] [path|url] [--static] [--anon] [--out FILE] [--keep]",
      "         [--depth N] [--top N] [--commits N] [--digits N] [--raw] [--json]",
      `desprawl ${VIEWS.join("|")} [path] [--json]`,
      "desprawl check [path] --base REF [--json]",
      "         a folder of repos reads as one, --repo NAME picks one of them",
      "         tasks also takes [--kind K] [--impact I] [--limit N] [--offline]",
      "         knowledge also takes [--grain module|file|declaration]",
      `         any of them takes [--lang ${LANGUAGES.join("|")}]`,
    ].join("\n"),
  )
  process.exit(0)
}

// git and node are the only things a user has to bring
const missing = needs()
if (missing) fail(missing)

// a first positional is the command only when it names one, otherwise it is the path
const KNOWN = ["cli", "view", "check", ...VIEWS]
const command = KNOWN.includes(positionals[0] ?? "") ? positionals[0] : ""
const asked = (command ? positionals[1] : positionals[0]) ?? process.cwd()

// a url is fetched to disk first, everything below only ever sees a path
const target = (() => {
  try {
    return isUrl(asked) ? local(asked) : asked
  } catch (err) {
    return fail(err)
  }
})()

// A call graph of a repo this size outgrows the heap node hands a process by default,
// and v8 will not raise that once it is running, so the run starts again with room
const ROOM = 30_000
if (!process.env.DESPRAWL_ROOM && getHeapStatistics().heap_size_limit < 6e9) {
  const held = fleet(target)
  let files = 0
  try {
    files = (held.length ? held : [target]).reduce(
      (sum, one) => sum + git(one, "ls-files").split("\n").length,
      0,
    )
  } catch {
    /* not a repo yet: whatever runs below says so properly */
  }
  if (files > ROOM) {
    const again = spawnSync(
      process.execPath,
      ["--max-old-space-size=8192", ...process.argv.slice(1)],
      { stdio: "inherit", env: { ...process.env, DESPRAWL_ROOM: "1" } },
    )
    process.exit(again.status ?? 1)
  }
}

// the terminal report is asked for by name or by --json
const viewing = (!command || command === "view") && !values.json

const num = (n: number): string => n.toLocaleString("en-US")
const day = (iso: string): string => (iso ? iso.slice(0, 10) : "-")

// junk falls back, never NaN
const int = (v: string | undefined, fallback: number): number =>
  Number(v) >= 1 ? Math.floor(Number(v)) : fallback

// magnitudes scaled, small exact
const big = values.raw ? num : (v: number) => human(v, int(values.digits, 3))
const top = int(values.top, 10)
const depth = int(values.depth, 1)

// junk or zero means the default, never NaN on git's command line
const cap = int(values.commits, 0) || undefined

const NAMES = 44

function table(rows: string[][]): string {
  const width = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
  width[0] = Math.min(width[0], NAMES)
  const name = (c: string): string =>
    c.length > NAMES ? `${c.slice(0, NAMES - 1)}…` : c.padEnd(width[0])
  return rows
    .map((r) => r.map((c, i) => (i === 0 ? name(c) : c.padStart(width[i]))).join("  "))
    .join("\n")
}

const HEAD = ["loc", "pct", "comment", "blank", "files", "chars", "~tok", "nest"]
const CHURN = ["com", "churn", "last"]

type Counts = Split & { files: number; chars: number }

// prettier-ignore
const row = (b: Counts, total: number, label: string, extra: string[] = []): string[] => [
  label, big(b.code), pct(b.code, total), big(b.comment), big(b.blank),
  num(b.files), big(b.chars), big(tokens(b.chars)), nest(b), ...extra,
]

const churn = (n: Node): string[] => [num(n.commits), big(n.insertions + n.deletions), day(n.last)]

const section = (title: string, head: string[], rows: string[][], total: string[]): string =>
  `\n${table([[title, ...head], ...rows, total])}`

// loose top-level files roll into (root)
function branch(n: Node, total: number, level = 0): string[][] {
  const kids = n.children ?? []
  const loose = level ? [] : kids.filter((c) => !c.children)
  const roll = blank("(root)")
  loose.forEach((f) => merge(roll, f))

  return [...(level ? kids : kids.filter((c) => c.children)), ...(loose.length ? [roll] : [])]
    .sort((a, b) => b.code - a.code)
    .flatMap((c) => [
      row(c, total, "  ".repeat(level) + c.name + (c.children ? "/" : ""), churn(c)),
      ...(level + 1 < depth ? branch(c, total, level + 1) : []),
    ])
}

/** what a printed payload is, before whatever it holds */
const wrapped = (kind: string, repo: string, data: unknown) =>
  JSON.stringify({ desprawl: VERSION, kind, repo, made: new Date().toISOString(), data }, null, 2)

function report(s: Stats): string {
  if (!s.files)
    return (
      `${s.repo}  @${s.head}\n` +
      "Nothing countable here. Every tracked file is binary, or has neither a known extension " +
      "nor a name desprawl recognises."
    )
  const source = s.code + s.comment
  const moved = s.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const shown = s.contributors.slice(0, top)

  const out = [
    `${s.repo}  @${s.head}`,
    `${big(s.code)} loc  ${big(s.comment)} comment (${pct(s.comment, source)} of source)  ` +
      `${big(s.blank)} blank  ${num(s.files)} files`,
    `${big(s.chars)} chars  ~${big(tokens(s.chars))} tokens`,
    `${num(s.commits)} commits  ${num(s.contributors.length)} contributors  ` +
      `${day(s.first)} to ${day(s.last)}`,
    section(
      "LANGUAGE",
      HEAD,
      s.languages.map((b) => row(b, s.code, b.name)),
      row(s, s.code, "total"),
    ),
    section(
      "TREE",
      [...HEAD, ...CHURN],
      branch(s.tree, s.code),
      row(s, s.code, "total", churn(s.tree)),
    ),
    `\nCONTRIBUTORS (top ${shown.length})`,
    table(
      shown.map((c) => [
        c.name,
        `${num(c.commits)}c`,
        pct(c.commits, s.commits),
        `+${big(c.insertions)}`,
        `-${big(c.deletions)}`,
        pct(c.insertions + c.deletions, moved),
        `${num(c.files)}f`,
        `${day(c.first)}..${day(c.last)}`,
      ]),
    ),
  ]

  if (s.contributors.length > top) {
    out.push(`${s.contributors.length - top} more, use --top ${s.contributors.length}`)
  }
  return out.join("\n")
}

try {
  if (!existsSync(target)) fail(`no such path as ${target}`)
  // --git-dir passes on bare repo / no commits these not
  if (!statSync(target).isDirectory()) fail(`${target} is a file, and desprawl reads a repo`)
  const held = fleet(target)
  if (values.repo && !held.length) fail("--repo is for a folder of repos, and this is one repo")
  const one = values.repo
    ? (held.find((path) => path.endsWith(`/${values.repo}`)) ??
      fail(
        `no repo called ${values.repo}. There is ${held.map((p) => p.split("/").pop()).join(", ")}`,
      ))
    : ""
  const reading = one || (held.length ? "" : target)
  if (reading) {
    git(reading, "rev-parse", "--show-toplevel")
    git(reading, "rev-parse", "HEAD")
  }

  // what this branch added, never what the repo holds: a threshold becomes a target
  if (command === "check") {
    const base = values.base
    if (!base) fail("check needs a --base to compare against, like --base main")
    const found = check(target, base!)
    if (values.json) {
      console.log(wrapped("check", resolve(target), found))
      process.exit(found.worse ? 1 : 0)
    }
    console.log(`${found.head} against ${found.base}`)
    for (const one of found.counts) {
      const sign =
        one.added > 0 ? `+${one.added}` : one.now < one.was ? `${one.now - one.was}` : "0"
      console.log(`${sign.padStart(5)}  ${one.name}  (${one.was} to ${one.now})`)
      for (const which of one.which) console.log(`       ${which}`)
      if (one.added > one.which.length)
        console.log(`       and ${one.added - one.which.length} more`)
    }
    if (!found.worse) console.log("\nnothing new to answer for")
    process.exit(found.worse ? 1 : 0)
  }

  // one panel, straight to the terminal: the same numbers the tab shows
  if (VIEWS.includes(command as View)) {
    if ((values.kind || values.impact) && command !== "tasks")
      fail(`--kind and --impact are for tasks, not ${command}`)
    if (values.grain && command !== "knowledge") fail(`--grain is for knowledge, not ${command}`)
    if (values.kind && !KINDS.includes(values.kind as Sort))
      fail(`no such kind as ${values.kind}. There is ${KINDS.join(", ")}`)
    if (values.impact && !IMPACTS.includes(values.impact as Hits))
      fail(`no such impact as ${values.impact}. There is ${IMPACTS.join(", ")}`)
    // function was what the declaration grain was called, and old scripts still say it
    const grain = values.grain ? grainOf(values.grain) : ""
    if (values.grain && !grain)
      fail(`no such grain as ${values.grain}. There is ${GRAINS.join(", ")}`)
    if (values.lang && !LANGUAGES.includes(values.lang))
      fail(`no such language as ${values.lang}. There is ${LANGUAGES.join(", ")}`)
    const made = await views(command as View, target, {
      kind: values.kind,
      impact: values.impact,
      limit: values.limit ? int(values.limit, 0) : undefined,
      offline: values.offline,
      grain: grain || undefined,
      lang: values.lang,
    })
    // never process.exit here: it drops whatever of a large payload has not been written
    const data = values.anon ? hidden(made.data) : made.data
    const about = values.anon
      ? (resolve(target).split("/").filter(Boolean).pop() ?? "")
      : resolve(target)
    console.log(values.json ? wrapped(command, about, data) : made.text)
  }

  // analyses live not static
  else if (viewing && !values.static) {
    const port = Number(values.port) >= 1 ? Math.floor(Number(values.port)) : undefined
    const live = await serve(target, cap, values.keep, port, undefined, values.token, values.anon)
    // a reconnect command names the tab already waiting for it, so it opens nothing new
    if (values.token) console.log("Reconnected. The tab that was open picks this up on its own.")
    else {
      open(live)
      console.log(`Interface is live, if it doesn't open, click the link:\n\n${live}`)
    }
  } else {
    const read_ = reading ? analyze(reading, cap) : many(target, cap).all
    const stats = values.anon ? anonymous(read_) : read_
    // licences in disk, advisories network saved in page
    // a folder of repos has no manifest and no suite of its own, and asking for one throws
    const each = fleet(target)
    const held = viewing
      ? {
          deps: await Promise.all((each.length ? each : [target]).map((one) => deps(one)))
            .then(joined)
            .catch(() => null),
          suite: merged((each.length ? each : [target]).map(tests)),
          root: target,
        }
      : undefined
    if (viewing) console.log(view(stats, values.out, held))
    else console.log(values.json ? wrapped("stats", stats.repo, stats) : report(stats))
  }
} catch (err) {
  fail(err)
}
