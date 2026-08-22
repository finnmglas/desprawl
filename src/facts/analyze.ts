// owner: finn
// goal: repo stats

import { history } from "./history.ts"
import { VERSION, fold, git, grow } from "../read/model.ts"
import { scan } from "../read/scan.ts"
import { ignored } from "../read/graph.ts"
import { stack } from "./stack.ts"
import type { Remote, Stats } from "../read/model.ts"

const HOSTS: [string, Remote["host"]][] = [
  ["github.", "github"],
  ["gitlab.", "gitlab"],
  ["bitbucket.", "bitbucket"],
]

// git@host:o/r.git and ssh://git@host/o/r both become https://host/o/r
function browsable(raw: string): string {
  const url = raw
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "")
  return url.startsWith("http") ? url : ""
}

function remotes(repo: string): Remote[] {
  const found = new Map<string, Remote>()
  for (const line of git(repo, "remote", "-v").split("\n")) {
    const [name, rest] = line.split("\t")
    if (!rest) continue
    const url = browsable(rest.split(" ")[0])
    if (!url || found.has(url)) continue
    const host = HOSTS.find(([match]) => url.includes(match))?.[1] ?? "git"
    found.set(url, { name, url, host })
  }
  return [...found.values()]
}

export function analyze(repo: string, cap?: number, exclude?: RegExp): Stats {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const head = git(root, "rev-parse", "--short", "HEAD").trim()
  const skipped = { files: 0 }
  const files = scan(root, exclude ?? ignored(root), skipped)
  const { byPath, byWho, ...hist } = history(root, cap)
  for (const f of files) Object.assign(f, byPath.get(f.path), { by: byWho.get(f.path) ?? {} })

  const languages = fold(files, (f) => f.lang ?? "")
  const tree = grow(files)
  // a file's langs is redundant once the parents have aggregated
  for (const f of files) f.langs = {}
  // commits and last would clobber the repo-wide pair
  const { name, path, lang, children, commits, last, ...totals } = tree
  return {
    version: VERSION,
    repo: root,
    head,
    ...hist,
    languages,
    stack: stack(root, languages),
    tree,
    remotes: remotes(root),
    skipped: skipped.files,
    ...totals,
  }
}
