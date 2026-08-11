// owner: finn
// goal: html stats ui

import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { calls } from "./calls.ts"
import type { Calls } from "./calls.ts"
import type { Deps } from "./deps.ts"
import { build } from "./graph.ts"
import type { Graph } from "./graph.ts"
import type { Stats } from "./model.ts"

export function open(target: string): void {
  // windows has no opener binary, its start is a shell builtin, and the "" is the window title
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
  const built = join(import.meta.dirname, "../dist/index.html")
  if (!existsSync(built)) throw new Error("no viewer built, run: pnpm build")
  return readFileSync(built, "utf8")
}

/** past this the call graph is minutes of work and a file too big to send anywhere */
const HEAVY = 1500

// the first one is the document's own: bundled code holds "</head>" in strings, and
// vite hoists its script above anything left further down
const HEAD = "<head>"

/** the page and everything it would ask a server for, reusing what a caller holds */
export function page(
  stats: Stats,
  held?: { graph?: Graph; called?: Calls | null; deps?: Deps | null; viewer?: string },
): { html: string; skipped: number } {
  // < escaped so a path holding </script> cannot close the tag
  const inline = (data: unknown) => JSON.stringify(data).replaceAll("<", "\\u003c")
  const graph = held?.graph ?? build(stats.repo)
  const heavy = graph.stats.files > HEAVY
  const said = held?.called ?? (heavy ? null : calls(stats.repo, graph))

  const data =
    `<script>window.__DESPRAWL__=${inline(stats)};window.__DESPRAWL_GRAPH__=${inline(graph)}` +
    `${said ? `;window.__DESPRAWL_CALLS__=${inline(said)}` : ""}` +
    `${held?.deps ? `;window.__DESPRAWL_DEPS__=${inline(held.deps)}` : ""}</script>`
  const shell_ = held?.viewer ?? shell()
  const at = shell_.indexOf(HEAD)
  if (at === -1) throw new Error("no <head> in the built page, run: pnpm build")
  // set before the bundle runs, or the app mounts with nothing
  const open = at + HEAD.length
  const html = shell_.slice(0, open) + data + shell_.slice(open)
  return { html, skipped: heavy && !said ? graph.stats.files : 0 }
}

/**
 * A published page hands every commit email over as one scrapeable blob. Blanking them
 * takes the faces with it: an avatar and a profile link are both derived from the address.
 */
export const anonymous = (stats: Stats): Stats => ({
  ...stats,
  contributors: stats.contributors.map((one) => ({ ...one, email: "" })),
})

export function view(stats: Stats, into?: string, held?: { deps?: Deps | null }): string {
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
