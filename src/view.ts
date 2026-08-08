// owner: finn
// goal: html stats ui

import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Stats } from "./model.ts"

const OPEN: Record<string, string> = { darwin: "open", win32: "start" }

export function open(target: string): void {
  const opener = OPEN[process.platform] ?? "xdg-open"
  spawn(opener, [target], { detached: true, stdio: "ignore" }).unref()
}

export function shell(): string {
  const built = join(import.meta.dirname, "../dist/index.html")
  if (!existsSync(built)) throw new Error("no viewer built, run: pnpm build")
  return readFileSync(built, "utf8")
}

export function view(stats: Stats): string {
  // < escaped so a path holding </script> cannot close the tag
  const data = JSON.stringify(stats).replaceAll("<", "\\u003c")
  const html = shell().replace("</head>", `<script>window.__DESPRAWL__=${data}</script></head>`)

  const out = join(tmpdir(), `desprawl-${stats.head}.html`)
  writeFileSync(out, html)
  open(out)
  return out
}
