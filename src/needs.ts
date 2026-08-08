// owner: finn
// goal: name missing deps and hint installation

import { existsSync } from "node:fs"
import { delimiter, join } from "node:path"
import { ENGINE } from "./model.ts"

const EXE = process.platform === "win32" ? ".exe" : ""

// prettier-ignore
const LINUX: [string, string][] = [
  ["apt", "sudo apt install"], ["dnf", "sudo dnf install"], ["pacman", "sudo pacman -S"],
  ["zypper", "sudo zypper install"], ["apk", "sudo apk add"], ["brew", "brew install"],
]

const WINGET: Record<string, string> = { git: "Git.Git", node: "OpenJS.NodeJS" }

const onPath = (bin: string): boolean =>
  (process.env.PATH ?? "").split(delimiter).some((dir) => existsSync(join(dir, bin + EXE)))

/** What to type to get a missing binary, on whatever machine this is */
function install(tool: string): string {
  // the tools ship with the xcode command line tools, brew only if it is already there
  if (process.platform === "darwin")
    return onPath("brew") ? `brew install ${tool}` : "xcode-select --install"
  if (process.platform === "win32") return `winget install --id ${WINGET[tool] ?? tool}`
  const manager = LINUX.find(([bin]) => onPath(bin))
  return manager ? `${manager[1]} ${tool}` : `install ${tool} with your package manager`
}

// the first part that differs decides, 24.13 is not older than 22.18
const older = (have: string, want: string): boolean => {
  const [a, b] = [have, want].map((v) => v.split(".").map(Number))
  const i = b.findIndex((part, n) => (a[n] ?? 0) !== part)
  return i >= 0 && (a[i] ?? 0) < b[i]
}

/**
 * Node and git are not ours to install, so a missing one has to say so itself.
 * Everything else desprawl needs ships inside the package.
 */
export function needs(): string | null {
  const want = ENGINE.replace(/[^\d.]/g, "")
  if (older(process.versions.node, want))
    return `needs node ${want} or newer, this is ${process.versions.node}\n  install: nvm install ${want.split(".")[0]}  (or nodejs.org)`
  if (!onPath("git")) return `needs git, which is not on PATH\n  install: ${install("git")}`
  return null
}

/** Git's own wording for the states a new user lands in first */
export function explain(err: unknown): string | null {
  const text = err instanceof Error ? err.message : String(err)
  if ((err as NodeJS.ErrnoException)?.code === "ENOENT")
    return `needs git, which is not on PATH\n  install: ${install("git")}`
  if (/must be run in a work tree|this operation must be run/i.test(text))
    return "this is a bare repository, and desprawl reads files from a working tree"
  if (/not a git repository/i.test(text))
    return "not a git repository. Run it inside one, or give it a path"
  // git says unknown revision for both, only the name it could not find separates them
  if (/Needed a single revision/i.test(text) || /unknown revision.*/i.test(text))
    return /'HEAD'|Needed a single revision/.test(text)
      ? "this repository has no commits yet, so there is nothing to read"
      : "no such commit in this repository"
  // git printed its own reason as it ran, repeating the command adds nothing
  if (/Command failed: git clone/.test(text)) return "could not clone that url, git said why above"
  // anything else from git: keep its words, drop the command line we built
  const said = text.match(/^fatal: (.+)$/m)?.[1]
  if (said) return said
  return null
}
