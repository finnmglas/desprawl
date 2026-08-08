#!/usr/bin/env node
// owner: finn
// goal: render stats

import { parseArgs } from "node:util"
import { analyze, blank, merge, tokens } from "./analyze.ts"
import type { Bucket, Node, Split, Stats } from "./analyze.ts"

const { values, positionals } = parseArgs({
  options: {
    json: { type: "boolean", default: false },
    top: { type: "string", default: "10" },
    digits: { type: "string", default: "3" },
    depth: { type: "string", default: "1" },
    raw: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log("desprawl [path] [--depth N] [--top N] [--digits N] [--raw] [--json]")
  process.exit(0)
}

const num = (n: number): string => n.toLocaleString("en-US")
const pct = (n: number, of: number): string => (of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%")
const day = (iso: string): string => (iso ? iso.slice(0, 10) : "-")

const UNITS = ["", "k", "m", "b", "t"]

// digits 2: 1, 10, 0.1k, 1.0k, 10k, 0.1m
function human(n: number, digits: number): string {
  const sign = n < 0 ? "-" : ""
  let v = Math.abs(n)
  let unit = 0
  while (v >= 10 ** digits && unit < UNITS.length - 1) {
    v /= 1000
    unit++
  }
  if (unit === 0) return sign + Math.round(v)
  const whole = Math.floor(v).toString().length
  return sign + v.toFixed(Math.max(0, digits - whole)) + UNITS[unit]
}

// mean nesting lv
const nest = (b: Split): string => (b.code ? (b.indent / b.code).toFixed(1) : "0.0")

// magnitudes scaled, small exact
const big = values.raw ? num : (v: number) => human(v, Number(values.digits))

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

type Counts = Split & { files: number; chars: number }

const row = (b: Counts, s: Stats, label: string): string[] => [
  label, big(b.code), pct(b.code, s.code), big(b.comment), big(b.blank),
  num(b.files), big(b.chars), big(tokens(b.chars)), nest(b),
]

// header sets widths
function buckets(title: string, list: Bucket[], s: Stats): string {
  const rows = list.map((b) => row(b, s, b.name))
  return `\n${table([[title, ...HEAD], ...rows, row(s, s, "total")])}`
}

// loose top-level files roll into (root)
function branch(n: Node, s: Stats, depth: number, level = 0): string[][] {
  const kids = n.children ?? []
  const dirs = level ? kids : kids.filter((c) => c.children)
  const loose = level ? [] : kids.filter((c) => !c.children)
  const roll = blank("(root)")
  loose.forEach((f) => merge(roll, f))

  return [...dirs, ...(loose.length ? [roll] : [])]
    .sort((a, b) => b.code - a.code)
    .flatMap((c) => [
      row(c, s, "  ".repeat(level) + c.name + (c.children ? "/" : "")),
      ...(level + 1 < depth ? branch(c, s, depth, level + 1) : []),
    ])
}

function report(s: Stats, top: number, depth: number): string {
  const source = s.code + s.comment
  const churn = s.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const shown = s.contributors.slice(0, top)

  const out = [
    `${s.repo}  @${s.head}`,
    `${big(s.code)} loc  ${big(s.comment)} comment (${pct(s.comment, source)} of source)  ` +
      `${big(s.blank)} blank  ${num(s.files)} files`,
    `${big(s.chars)} chars  ~${big(tokens(s.chars))} tokens`,
    `${num(s.commits)} commits  ${num(s.contributors.length)} contributors  ` +
      `${day(s.first)} to ${day(s.last)}`,
    buckets("LANGUAGE", s.languages, s),
    `\n${table([["TREE", ...HEAD], ...branch(s.tree, s, depth), row(s, s, "total")])}`,
    `\nCONTRIBUTORS (top ${shown.length})`,
    table(
      shown.map((c) => [
        c.name,
        `${num(c.commits)}c`,
        pct(c.commits, s.commits),
        `+${big(c.insertions)}`,
        `-${big(c.deletions)}`,
        pct(c.insertions + c.deletions, churn),
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
  const stats = analyze(positionals[0] ?? process.cwd())
  console.log(
    values.json
      ? JSON.stringify(stats, null, 2)
      : report(stats, Number(values.top), Number(values.depth)),
  )
} catch (err) {
  console.error(`desprawl: ${err instanceof Error ? err.message.trim() : err}`)
  process.exit(1)
}
