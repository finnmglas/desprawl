#!/usr/bin/env node
// owner: finn
// goal: render stats

import { parseArgs } from "node:util"
import { analyze, tokens } from "./analyze.ts"
import type { Bucket, Stats } from "./analyze.ts"

const { values, positionals } = parseArgs({
  options: {
    json: { type: "boolean", default: false },
    top: { type: "string", default: "10" },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log("desprawl [path] [--top N] [--json]")
  process.exit(0)
}

const num = (n: number): string => n.toLocaleString("en-US")
const pct = (n: number, of: number): string => (of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%")
const day = (iso: string): string => (iso ? iso.slice(0, 10) : "-")
const short = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : num(n)

function table(rows: string[][]): string {
  const width = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
  return rows
    .map((r) => r.map((c, i) => (i === 0 ? c.padEnd(width[i]) : c.padStart(width[i]))).join("  "))
    .join("\n")
}

// header row joins the table so the widths account for it
function buckets(title: string, list: Bucket[], s: Stats): string {
  const row = (b: Bucket): string[] => [
    b.name, num(b.code), pct(b.code, s.code), num(b.comment), num(b.blank),
    num(b.files), num(b.chars), num(tokens(b.chars)),
  ]
  return `\n${table([
    [title, "code", "pct", "comment", "blank", "files", "chars", "~tok"],
    ...list.map(row),
    row({ ...s, name: "total" }),
  ])}`
}

function report(s: Stats, top: number): string {
  const source = s.code + s.comment
  const churn = s.contributors.reduce((a, c) => a + c.insertions + c.deletions, 0)
  const shown = s.contributors.slice(0, top)

  const out = [
    `${s.repo}  @${s.head}`,
    `${num(s.code)} code  ${num(s.comment)} comment (${pct(s.comment, source)} of source)  ` +
      `${num(s.blank)} blank  ${num(s.files)} files`,
    `${short(s.chars)} chars  ~${short(tokens(s.chars))} tokens`,
    `${num(s.commits)} commits  ${num(s.contributors.length)} contributors  ` +
      `${day(s.first)} to ${day(s.last)}`,
    buckets("LANGUAGE", s.languages, s),
    buckets("MODULE", s.modules, s),
    `\nCONTRIBUTORS (top ${shown.length})`,
    table(
      shown.map((c) => [
        c.name,
        `${num(c.commits)}c`,
        pct(c.commits, s.commits),
        `+${num(c.insertions)}`,
        `-${num(c.deletions)}`,
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
  console.log(values.json ? JSON.stringify(stats, null, 2) : report(stats, Number(values.top)))
} catch (err) {
  console.error(`desprawl: ${err instanceof Error ? err.message.trim() : err}`)
  process.exit(1)
}
