// owner: finn
// goal: opened commit, inline

import { Note } from "../../atoms/card.tsx"
import { Moved } from "../../atoms/moved.tsx"
import { day, num } from "../../../lib/say/format.ts"
import type { Detail } from "../../../../src/facts/history.ts"

/** Fixed, so the rails beside the list can account for the gap exactly. */
export const DETAIL = 200

export function CommitDetail({
  commit,
  live,
  onFile,
}: {
  commit: Detail | null
  /** a saved page has the log, not the diffs */
  live?: boolean
  onFile: (path: string) => void
}) {
  return (
    <div style={{ height: DETAIL }} className="bg-muted/30 overflow-auto border-y px-3 py-2">
      {!commit ? (
        <Note>
          {live
            ? "loading…"
            : "A saved page carries the log, not the diffs. Run desprawl on the repo to open a commit."}
        </Note>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground text-xs">
            {commit.hash} · {commit.author} · {day(commit.date)} · {num(commit.files.length)} files
          </div>
          {commit.body && (
            <pre className="text-muted-foreground max-h-20 overflow-auto text-xs whitespace-pre-wrap">
              {commit.body}
            </pre>
          )}
          <div className="flex flex-col">
            {commit.files.map((file) => (
              <button
                key={file.path}
                onClick={() => onFile(file.path)}
                title="What this file is, and where it leads"
                className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-sm text-left text-xs tabular-nums"
              >
                <Moved n={file.ins} kind="ins" className="w-14 text-right" />
                <Moved n={file.del} kind="del" className="w-14 text-right" />
                <span className="truncate font-mono">{file.path}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
