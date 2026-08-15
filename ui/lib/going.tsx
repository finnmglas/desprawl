// owner: finn
// goal: where a click leads, decided once rather than per panel

import { createContext, useContext } from "react"
import type { View } from "./hash.ts"

/** clicking one asks what to do with it rather than guessing */
export interface Target {
  kind: "file" | "folder" | "module" | "symbol"
  /** the repo path, or file#name for a declaration */
  id: string
  /** what to call it, when the id is not what a reader would read */
  name?: string
  /** the line it is declared on */
  line?: number
  /** what is already known about it, since a list of links on its own explains nothing */
  note?: React.ReactNode
  /** everything else worth saying, under the moves: shape, size, who works in it */
  detail?: React.ReactNode
  /** what it leads to, each openable in turn without closing */
  related?: string[]
  /** what that list is */
  relation?: string
}

export interface Going {
  /** the whole view, so a panel can read what is picked as well as move */
  at: View
  /** move, merged onto where we already are */
  go: (next: Partial<View>) => void
  /** the view behind this one, when the reader came from somewhere */
  was: View | null
  /** ask what to do with something */
  open: (target: Target) => void
}

const Where = createContext<Going | null>(null)

export const GoingProvider = Where.Provider

// every view sits under the provider App renders, so the null is unreachable
export const useGoing = (): Going => useContext(Where)!

/** the folder holding a file, as the segments Files walks by */
export const folderOf = (path: string): string[] =>
  path
    .replace(/\/?\*$/, "")
    .split("/")
    .slice(0, -1)
    .filter(Boolean)

/** a group path can be a folder, a remainder like src/* or a single file */
export const isFile = (path: string): boolean => /\.[a-z0-9]+$/i.test(path)

const bare = (path: string) => path.replace(/\/?\*$/, "").split("#")[0]

/** itself, the deepest one holding it, or the first one inside it */
export function holds(pick: string, paths: string[]): string {
  if (!pick) return ""
  const want = bare(pick)
  if (paths.includes(pick)) return pick
  const over = paths.filter((one) => want === bare(one) || want.startsWith(`${bare(one)}/`))
  if (over.length) return over.sort((a, b) => bare(b).length - bare(a).length)[0]
  // the nearest thing inside it, shallowest first
  const under = paths.filter((one) => bare(one).startsWith(`${want}/`))
  return under.sort((a, b) => bare(a).length - bare(b).length)[0] ?? ""
}

export const file = (path: string, note?: React.ReactNode): Target => ({
  kind: "file",
  id: path,
  note,
})

/** a module group, which may be a folder, a remainder or one file standing alone */
export const group = (path: string, name?: string, note?: React.ReactNode): Target => ({
  kind: isFile(path.replace(/\/?\*$/, "")) ? "file" : "module",
  id: path,
  name,
  note,
})

export const symbol = (id: string, line?: number, note?: React.ReactNode): Target => ({
  kind: "symbol",
  id,
  name: id.split("#").pop(),
  line,
  note,
})
