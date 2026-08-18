// owner: finn
// goal: page 2 pdf

import { execFile, execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const BROWSERS = [
  process.env.CHROME,
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter((one): one is string => !!one)

/** the first one installed */
export function browser(): string | null {
  for (const named of BROWSERS) {
    if (named.includes("/") || named.includes("\\")) {
      if (existsSync(named)) return named
      continue
    }
    try {
      execFileSync("which", [named], { stdio: "pipe" })
      return named
    } catch {}
  }
  return null
}

/** headless, so the text stays text. Never sync: it asks this same process for the page */
export function print(url: string, wait = 15_000): Promise<Buffer> {
  const found = browser()
  if (!found) throw new Error("no chrome, chromium or edge found to print with")
  const dir = mkdtempSync(join(tmpdir(), "desprawl-"))
  const out = join(dir, "report.pdf")
  return new Promise((resolve, reject) => {
    execFile(
      found,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        // its own profile, so an open browser is left alone
        `--user-data-dir=${join(dir, "profile")}`,
        `--virtual-time-budget=${wait}`,
        `--print-to-pdf=${out}`,
        url,
      ],
      { timeout: wait + 30_000 },
      (err) => {
        try {
          if (existsSync(out)) resolve(readFileSync(out))
          else reject(err ?? new Error("the browser wrote no pdf"))
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      },
    )
  })
}
