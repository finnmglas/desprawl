// owner: finn
// goal: repo stats

import { history } from "./history.ts"
import { fold, git, grow } from "./model.ts"
import { scan } from "./scan.ts"
import type { Stats } from "./model.ts"

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
    repo: root,
    head,
    ...hist,
    languages: fold(files, (f) => f.lang ?? ""),
    tree,
    ...totals,
  }
}
