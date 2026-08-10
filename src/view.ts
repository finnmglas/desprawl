// owner: finn
// goal: html stats ui

import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { calls } from "./calls.ts"
import type { Calls } from "./calls.ts"
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

/**
 * One file holding the page and everything it could otherwise ask a server for.
 * The graphs are taken when a caller already has them, since a server does.
 */
export function page(
  stats: Stats,
  held?: { graph?: Graph; called?: Calls | null; viewer?: string },
): { html: string; skipped: number } {
  // < escaped so a path holding </script> cannot close the tag
  const inline = (data: unknown) => JSON.stringify(data).replaceAll("<", "\\u003c")
  const graph = held?.graph ?? build(stats.repo)
  const heavy = graph.stats.files > HEAVY
  const said = held?.called ?? (heavy ? null : calls(stats.repo, graph))

  const html = (held?.viewer ?? shell()).replace(
    "</head>",
    `<script>window.__DESPRAWL__=${inline(stats)};window.__DESPRAWL_GRAPH__=${inline(graph)}` +
      `${said ? `;window.__DESPRAWL_CALLS__=${inline(said)}` : ""}</script></head>`,
  )
  return { html, skipped: heavy && !said ? graph.stats.files : 0 }
}

export function view(stats: Stats): string {
  const { html, skipped } = page(stats)
  if (skipped)
    console.log(
      `\nToo many files (${skipped}) to read every call for a single page, so the call graph was left out.\n`,
    )

  const name = stats.repo.split(/[\\/]/).filter(Boolean).pop() || "repo"
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const out = join(tmpdir(), `${stamp}-${name}-${stats.head}.html`)
  writeFileSync(out, html)
  open(out)
  return out
}
