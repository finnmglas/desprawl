// owner: finn
// goal: repo stats

import { history } from "./history.ts"
import { VERSION, fold, git, grow } from "./model.ts"
import { scan } from "./scan.ts"
import type { Remote, Stats } from "./model.ts"

const HOSTS: [string, Remote["host"]][] = [
  ["github.", "github"],
  ["gitlab.", "gitlab"],
  ["bitbucket.", "bitbucket"],
]

/** git@host:owner/repo.git and ssh://git@host/owner/repo both become https://host/owner/repo */
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

export function analyze(repo: string): Stats {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const head = git(root, "rev-parse", "--short", "HEAD").trim()
  const files = scan(root)
  const { byPath, ...hist } = history(root)
  for (const f of files) Object.assign(f, byPath.get(f.path))

  const tree = grow(files)
  // commits and last would clobber the repo-wide pair
  const { name, path, lang, children, commits, last, ...totals } = tree
  return {
    version: VERSION,
    repo: root,
    head,
    ...hist,
    languages: fold(files, (f) => f.lang ?? ""),
    tree,
    remotes: remotes(root),
    ...totals,
  }
}
