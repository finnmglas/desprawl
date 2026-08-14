// owner: finn
// goal: what you pointed at, and every place it leads, rather than one guess

import { useState } from "react"
import { Note } from "../atoms/card.tsx"
import { Dialog } from "../atoms/dialog.tsx"
import { CopyButton } from "./copy-button.tsx"
import { Blocks, Dots, Eye, FolderMark, Run } from "../atoms/icons.tsx"
import { FileView } from "./file-view.tsx"
import { Kind } from "./mark.tsx"
import { num, plural, shortPath } from "../../lib/format.ts"
import { isLive } from "../../lib/live.ts"
import { mainly } from "../../lib/tint.ts"
import { folderOf, useGoing, type Target } from "../../lib/going.tsx"
import { cn } from "../../lib/ui.ts"
import type { Node, Stats } from "../../../src/model.ts"

const WHAT: Record<Target["kind"], string> = {
  file: "file",
  folder: "folder",
  module: "module group",
  symbol: "declaration",
}

interface Deed {
  /** the tab it lands on, which is the whole label: the icon beside it says the rest */
  label: string
  why: string
  icon: React.ReactNode
  run: () => void
}

/** the counted row for a path, when the tree carries one. A served tree holds folders
 * only, so a file usually has none and the panel says less rather than nothing */
function nodeAt(tree: Node, path: string): Node | undefined {
  let at: Node | undefined = tree
  for (const part of path.split("/").filter(Boolean)) {
    at = at?.children?.find((c) => c.name === part)
    if (!at) return undefined
  }
  return at === tree ? undefined : at
}

export function Picked({
  target,
  stats,
  onClose,
}: {
  target: Target | null
  stats: Stats
  onClose: () => void
}) {
  const { go, open } = useGoing()
  const [reading, setReading] = useState("")

  if (!target) return null

  const bare = target.id.replace(/\/?\*$/, "")
  const file = target.kind === "symbol" ? target.id.split("#")[0] : bare
  const name = target.name || bare.split("/").pop() || "the repo root"
  const node = nodeAt(stats.tree, target.kind === "symbol" ? file : bare)
  // a group is a folder as often as not, and then Files opens it rather than its parent
  const roomy = target.kind === "folder" || target.kind === "module"
  const where = target.kind === "symbol" ? `${file}${target.line ? `:${target.line}` : ""}` : bare
  const live = isLive()

  const leave = (next: Parameters<typeof go>[0]) => {
    go(next)
    onClose()
  }

  const inFiles: Deed = {
    label: "Files",
    icon: <FolderMark />,
    why: roomy ? "the tree, inside it" : "the tree, at its folder",
    run: () =>
      leave({
        tab: "Files",
        path: roomy ? bare.split("/").filter(Boolean) : folderOf(file),
        pick: roomy ? "" : file,
      }),
  }
  const inModules: Deed = {
    label: "Modules",
    icon: <Blocks />,
    why: "the group holding it",
    run: () => leave({ tab: "Modules", pick: target.id }),
  }
  const inGraph: Deed = {
    label: "Graph",
    icon: <Dots />,
    why: "framed in the picture",
    run: () => leave({ tab: "Graph", pick: target.id }),
  }
  const inCalls: Deed = {
    label: "Execution",
    icon: <Run />,
    why: "what it declares",
    run: () => leave({ tab: "Execution", pick: target.id }),
  }
  const readIt: Deed = {
    label: "Read",
    icon: <Eye />,
    why: target.line ? `the source, at line ${num(target.line)}` : "the source",
    run: () => setReading(file),
  }

  const deeds: Deed[] =
    target.kind === "symbol"
      ? [...(live ? [readIt] : []), inCalls, inGraph, inFiles]
      : target.kind === "file"
        ? [...(live ? [readIt] : []), inFiles, inCalls, inModules, inGraph]
        : target.kind === "folder"
          ? [inFiles, inModules, inGraph]
          : [inModules, inGraph, inFiles]

  const facts =
    target.note ??
    (node ? (
      <>
        {node.children
          ? `${plural(node.files, "file")} · ${num(node.code)} loc`
          : `${num(node.code)} loc · ${num(node.commits)} commits`}
      </>
    ) : null)

  return (
    <>
      <Dialog
        open={!reading}
        onClose={onClose}
        className="max-w-md gap-3"
        title={
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
              {WHAT[target.kind]}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Kind folder={roomy} lang={node?.lang ?? (node ? mainly(node.langs) : "")} />
              <span className="min-w-0 truncate text-base leading-snug font-medium">{name}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
                {where}
              </span>
              <CopyButton
                className="-my-1 shrink-0"
                label="Copy the path"
                text={() => where}
                message="Copied the path"
                note={where}
              />
            </span>
          </div>
        }
      >
        {facts && <p className="text-muted-foreground text-sm">{facts}</p>}

        <div className="flex flex-col gap-1">
          {deeds.map((deed) => (
            <button
              key={deed.label}
              onClick={deed.run}
              title={deed.why}
              className="hover:bg-muted/60 hover:border-ring flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-left text-sm font-medium transition-colors"
            >
              {deed.icon}
              {deed.label}
              <span className="text-muted-foreground ml-auto">&rarr;</span>
            </button>
          ))}
          {!live && (target.kind === "file" || target.kind === "symbol") && (
            <Note className="self-center px-1">no source in a saved page</Note>
          )}
        </div>

        {target.related && target.related.length > 0 && (
          <div className="flex flex-col gap-1 border-t pt-3">
            <span className="text-muted-foreground text-xs">
              {target.relation ?? `${plural(target.related.length, "file")} with it`}
            </span>
            <div className="flex max-h-40 flex-col overflow-auto">
              {target.related.map((one) => (
                <button
                  key={one}
                  onClick={() => open({ kind: "file", id: one })}
                  title={one}
                  className={cn(
                    "hover:bg-muted/60 cursor-pointer truncate rounded-sm px-1 py-0.5 text-left font-mono text-xs",
                    one === target.id && "text-muted-foreground",
                  )}
                >
                  {shortPath(one, 52)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      <FileView
        path={reading}
        node={node && !node.children ? node : undefined}
        line={target.line}
        onClose={() => setReading("")}
      />
    </>
  )
}
