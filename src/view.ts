// owner: finn
// goal: html stats ui

import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

export function view(stats: Stats): string {
  // < escaped so a path holding </script> cannot close the tag
  const data = JSON.stringify(stats).replaceAll("<", "\\u003c")
  const html = shell().replace("</head>", `<script>window.__DESPRAWL__=${data}</script></head>`)

  const out = join(tmpdir(), `desprawl-${stats.head}.html`)
  writeFileSync(out, html)
  open(out)
  return out
}
