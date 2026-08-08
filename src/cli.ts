#!/usr/bin/env node
// owner: finn
// goal: render stats

import { parseArgs } from "node:util"
import { analyze } from "./analyze.ts"
import { human } from "./human.ts"
import { blank, merge, tokens } from "./model.ts"
import { serve } from "./serve.ts"
import { view } from "./view.ts"
import type { Node, Split, Stats } from "./model.ts"

const fail = (err: unknown): never => {
  console.error(`desprawl: ${err instanceof Error ? err.message.trim() : err}`)
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
    "desprawl [view] [path] [--static] [--depth N] [--top N] [--commits N] [--digits N] [--raw] [--json]",
  )
  process.exit(0)
}

const viewing = positionals[0] === "view"
const target = (viewing ? positionals[1] : positionals[0]) ?? process.cwd()

const num = (n: number): string => n.toLocaleString("en-US")
const pct = (n: number, of: number): string => (of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%")
const day = (iso: string): string => (iso ? iso.slice(0, 10) : "-")

// mean nesting lv
const nest = (b: Split): string => (b.code ? (b.indent / b.code).toFixed(1) : "0.0")

// junk falls back, never NaN
const int = (v: string | undefined, fallback: number): number =>
  Number(v) >= 1 ? Math.floor(Number(v)) : fallback

// magnitudes scaled, small exact
const big = values.raw ? num : (v: number) => human(v, int(values.digits, 3))
const top = int(values.top, 10)
const depth = int(values.depth, 1)

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

// header sets widths
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

function report(s: Stats): string {
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
  // live analyses per request, so it never needs the report up front
  if (viewing && !values.static)
    console.log(await serve(target, values.commits ? Number(values.commits) : undefined))
  else {
    const stats = analyze(target, values.commits ? Number(values.commits) : undefined)
    if (viewing) console.log(view(stats))
    else console.log(values.json ? JSON.stringify(stats, null, 2) : report(stats))
  }
} catch (err) {
  fail(err)
}
