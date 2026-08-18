// owner: finn
// goal: html stats ui

import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { calls } from "../read/calls.ts"
import type { Calls } from "../read/calls.ts"
import type { Deps } from "../facts/deps.ts"
import type { Suite } from "../facts/tests.ts"
import { build } from "../read/graph.ts"
import { everyCall, fleet, graphs } from "../facts/many.ts"
import { copied, repeated, talky } from "../facts/sprawl.ts"
import type { Graph } from "../read/graph.ts"
import { made } from "../read/model.ts"
import type { Contributor, Stats } from "../read/model.ts"

export function open(target: string): void {
  // windows start is a shell builtin, and the "" is the window title
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", target]]
      : [process.platform === "darwin" ? "open" : "xdg-open", [target]]

  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true })
  // a headless box has no opener, and the url was printed anyway
  child.on("error", () => {})
  child.unref()
}

export function shell(): string {
  const built = join(import.meta.dirname, "../../dist/index.html")
  if (!existsSync(built)) throw new Error("no viewer built, run: pnpm build")
  return readFileSync(built, "utf8")
}

/** past this the call graph is minutes of work */
const HEAVY = 1500

// the first is the document's own: bundled code holds </head> in strings
const HEAD = "<head>"

/** the page and everything it would ask a server for, reusing what a caller holds */
export function page(
  stats: Stats,
  held?: {
    graph?: Graph
    called?: Calls | null
    deps?: Deps | null
    suite?: Suite | null
    viewer?: string
    /** where to read from, when the payload's own path was hidden */
    root?: string
  },
): { html: string; skipped: number } {
  // < escaped so a path holding </script> cannot close the tag
  const inline = (data: unknown) => JSON.stringify(data).replaceAll("<", "\\u003c")
  const root = held?.root ?? stats.repo
  // a folder of repos is read as one, the same way the served run reads it
  const some = fleet(root).length > 0
  const graph = held?.graph ?? (some ? graphs(root) : build(root))
  const heavy = graph.stats.files > HEAVY
  const said = held?.called ?? (heavy ? null : some ? everyCall(root) : calls(root, graph))
  const paths = Object.keys(graph.modules)
  const loose = {
    ...made(root),
    repeated: repeated(root, paths),
    copied: copied(root, paths),
    talky: talky(root, paths),
  }

  const data =
    `<script>window.__DESPRAWL__=${inline(stats)};window.__DESPRAWL_GRAPH__=${inline(graph)}` +
    `${said ? `;window.__DESPRAWL_CALLS__=${inline(said)}` : ""}` +
    `${held?.deps ? `;window.__DESPRAWL_DEPS__=${inline(held.deps)}` : ""}` +
    `;window.__DESPRAWL_SPRAWL__=${inline(loose)}` +
    `${held?.suite ? `;window.__DESPRAWL_TESTS__=${inline(held.suite)}` : ""}</script>`
  const shell_ = held?.viewer ?? shell()
  const at = shell_.indexOf(HEAD)
  if (at === -1) throw new Error("no <head> in the built page, run: pnpm build")
  // set before the bundle runs, or the app mounts with nothing
  const open = at + HEAD.length
  const html = shell_.slice(0, open) + data + shell_.slice(open)
  return { html, skipped: heavy && !said ? graph.stats.files : 0 }
}

/** blanking the addresses takes the faces with them */
/** the folder's own name: a path names the machine it was read on */
export const named = (path: string): string => path.split("/").filter(Boolean).pop() ?? path

/** every address out, folded ones included, and the path down to the folder name */
const nameless = (one: Contributor): Contributor => ({ ...one, email: "", also: undefined })

/** the same, for a payload that is not the whole of Stats: a view prints its own shape */
export function hidden(data: unknown): unknown {
  if (!data || typeof data !== "object") return data
  const held = { ...(data as Record<string, unknown>) }
  if (Array.isArray(held.contributors))
    held.contributors = (held.contributors as Contributor[]).map(nameless)
  if (Array.isArray(held.identities))
    held.identities = (held.identities as Contributor[]).map(nameless)
  if (typeof held.repo === "string") held.repo = named(held.repo)
  return held
}

// what git and the forges write for you, which names the account, the remote and the
// branch it came from. Prose a person typed is left alone: no tool can promise to read that
const FORGE = [
  [/^(Merge (?:pull request #\d+|(?:remote-tracking )?branch '[^']*')).*$/, "$1"],
  [/https?:\/\/\S+/g, ""],
  [/[\w.-]+\.[a-z]{2,}[:/][\w.-]+\/\S+/g, ""],
] as const

const plainly = (subject: string): string =>
  FORGE.reduce((held, [look, by]) => held.replace(look, by), subject)
    .replace(/\s+/g, " ")
    .trim()

export const anonymous = (stats: Stats): Stats => ({
  ...stats,
  repo: named(stats.repo),
  contributors: stats.contributors.map(nameless),
  // the unfolded list carries one row per address, which is the whole of what is hidden
  identities: stats.identities.map(nameless),
  // a remote names the account it is hosted under, and an ssh one is an address itself
  remotes: [],
  log: stats.log.map((one) => ({ ...one, subject: plainly(one.subject) })),
})

export function view(
  stats: Stats,
  into?: string,
  held?: { deps?: Deps | null; suite?: Suite | null; root?: string },
): string {
  const { html, skipped } = page(stats, held)
  if (skipped)
    console.log(
      `\nToo many files (${skipped}) to read every call for a single page, so the call graph was left out.\n`,
    )

  const name = stats.repo.split(/[\\/]/).filter(Boolean).pop() || "repo"
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  // a caller with somewhere to put it says so, rather than reading the path off stdout
  const out = into ?? join(tmpdir(), `${stamp}-${name}-${stats.head}.html`)
  writeFileSync(out, html)
  if (!into) open(out)
  return out
}
