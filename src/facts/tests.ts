// owner: finn
// goal: what tests exist and what they cover, without running anything

import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { reading } from "../read/graph.ts"
import { git } from "../read/model.ts"
import { roleOf } from "../read/layers.ts"
import { scrub } from "../read/specifiers.ts"

export interface Suite {
  /** the script a reader would run, and what it is called in the manifest */
  script: string
  command: string
  /** counted by scanning, since running them is the expensive thing */
  files: number
  cases: number
  runners: string[]
  /** the script that writes a report, or the command that would, per runner */
  measure: string
  measured: string
  /** read off a report already on disk, empty when nothing has been written */
  coverage: { lines: number; statements: number; branches: number; functions: number } | null
  covered: string
  ran: Run | null
}

/** nothing found, which is also what a folder of repos has in common */
const EMPTY: Suite = {
  script: "",
  command: "",
  files: 0,
  cases: 0,
  runners: [],
  measure: "",
  measured: "",
  coverage: null,
  covered: "",
  ran: null,
}

/** a folder of repos has as many suites as it has repos, and no one command to run */
export function merged(all: Suite[]): Suite {
  if (all.length < 2) return all[0] ?? EMPTY
  return {
    ...EMPTY,
    files: all.reduce((sum, one) => sum + one.files, 0),
    cases: all.reduce((sum, one) => sum + one.cases, 0),
    runners: [...new Set(all.flatMap((one) => one.runners))],
  }
}

export interface Run {
  ok: boolean
  code: number
  seconds: number
  output: string
}

/** whichever manager the lockfile says this repo is run with */
export const manager = (root: string) =>
  existsSync(join(root, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(join(root, "yarn.lock"))
      ? "yarn"
      : "npm"

/** what a finished child says, however it ended */
export function settle(
  err: (Error & { code?: number | string | null }) | null,
  out: string,
  bad: string,
  started: number,
  empty = "",
): Run {
  const output = `${out}${bad}`.trim()
  return {
    ok: !err,
    // a kill or a missing binary carries no numeric code, and 0 would read as fine
    code: typeof err?.code === "number" ? err.code : err ? 1 : 0,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    // totals go at the end, noise at the head
    output: output.length > 8000 ? `…\n${output.slice(-8000)}` : output || empty,
  }
}

// what a runner is asked to report with, absent a script
const MEASURE: Record<string, string> = {
  vitest: "npx vitest run --coverage --coverage.reporter=lcov",
  jest: "npx jest --coverage --coverageReporters=lcov",
  "node:test":
    "node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.info",
  mocha: "npx c8 --reporter=lcov npm test",
  ava: "npx c8 --reporter=lcov npm test",
}

// what declares a test, whichever runner is underneath
const CASE = /(^|[\s;{}])(test|it)(\.\w+)?\s*\(/g
const RUNNERS: [string, RegExp][] = [
  ["vitest", /^vitest$/],
  ["jest", /^jest$/],
  ["node:test", /^node:test$/],
  ["playwright", /^@playwright\/test$/],
  ["cypress", /^cypress$/],
  ["mocha", /^mocha$/],
  ["ava", /^ava$/],
  ["bun:test", /^bun:test$/],
]

/** a report someone already produced: istanbul writes both of these, and lcov is universal */
function coverage(root: string): { made: Suite["coverage"]; from: string } {
  const summary = reading(join(root, "coverage", "coverage-summary.json"))
  if (summary?.total)
    return {
      made: {
        lines: summary.total.lines?.pct ?? 0,
        statements: summary.total.statements?.pct ?? 0,
        branches: summary.total.branches?.pct ?? 0,
        functions: summary.total.functions?.pct ?? 0,
      },
      from: "coverage/coverage-summary.json",
    }

  const lcov = join(root, "coverage", "lcov.info")
  if (existsSync(lcov)) {
    const text = readFileSync(lcov, "utf8")
    const add = (key: string) =>
      [...text.matchAll(new RegExp(`^${key}:(\\d+)$`, "gm"))].reduce((sum, m) => sum + +m[1], 0)
    const pct = (hit: number, found: number) => (found ? Math.round((hit / found) * 1000) / 10 : 0)
    return {
      made: {
        lines: pct(add("LH"), add("LF")),
        statements: pct(add("LH"), add("LF")),
        branches: pct(add("BRH"), add("BRF")),
        functions: pct(add("FNH"), add("FNF")),
      },
      from: "coverage/lcov.info",
    }
  }
  return { made: null, from: "" }
}

/** what a repo would run, what it holds, and any coverage already lying about */
export function tests(repo: string): Suite {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const manifest = reading(join(root, "package.json"))
  const scripts = (manifest?.scripts ?? {}) as Record<string, string>
  const script = ["test", "test:unit", "tests", "spec"].find((one) => scripts[one]) ?? ""

  const deps = Object.keys({ ...manifest?.dependencies, ...manifest?.devDependencies })
  const runners = RUNNERS.filter(
    ([name, match]) =>
      deps.some((one) => match.test(one)) ||
      (name === "node:test" && /node --test|node:test/.test(script ? scripts[script] : "")),
  ).map(([name]) => name)

  let files = 0
  let cases = 0
  for (const path of git(root, "ls-files", "-z")
    .split("\0")
    .filter((one) => one && roleOf(one) === "test" && /\.[cm]?[jt]sx?$/.test(one))) {
    files++
    try {
      cases += (scrub(readFileSync(join(root, path), "utf8")).code.match(CASE) ?? []).length
    } catch {
      // unreadable is still a test file, it just contributes no cases
    }
  }

  // a repo that already writes a report says how, and otherwise the runner decides
  const measure =
    Object.keys(scripts).find(
      (one) =>
        /cov/i.test(one) ||
        /--coverage|\bc8\b|\bnyc\b|experimental-test-coverage/.test(scripts[one]),
    ) ?? ""
  const made_ = MEASURE[runners[0] ?? ""] ?? ""
  const measured = measure
    ? scripts[measure]
    : made_ && runners[0] === "node:test" && script
      ? // the glob belongs to this repo's own test script, so it is taken from there
        `${made_} ${scripts[script].replace(/^node --test\s*/, "")}`
      : made_

  const { made, from } = coverage(root)
  return {
    script,
    command: script ? scripts[script] : "",
    measure,
    measured,
    files,
    cases,
    runners,
    coverage: made,
    covered: from,
    ran: null,
  }
}

const LIMIT = 10 * 60_000

/** only when asked: a suite can take minutes */
export function run(repo: string, script: string, command = ""): Promise<Run> {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const run = manager(root)
  if (command) mkdirSync(join(root, "coverage"), { recursive: true })
  const started = Date.now()
  return new Promise((resolve) => {
    const sh = process.platform === "win32" ? ["cmd", "/c"] : ["/bin/sh", "-c"]
    execFile(
      command ? sh[0] : run,
      command ? [sh[1], command] : run === "npm" ? ["run", script] : [script],
      { cwd: root, timeout: LIMIT, maxBuffer: 1 << 26 },
      (err, stdout, stderr) => resolve(settle(err, stdout, stderr, started)),
    )
  })
}
