// owner: finn
// goal: the file behind a row, read rather than counted

import { useEffect, useState } from "react"
import { Note } from "../atoms/card.tsx"
import { Dialog } from "../atoms/dialog.tsx"
import { Kind } from "./mark.tsx"
import { CopyButton } from "./copy-button.tsx"
import { ago, nest, num, weight } from "../../lib/format.ts"
import { sourceOf } from "../../lib/live.ts"
import type { Source } from "../../../src/serve.ts"
import type { Node } from "../../../src/model.ts"

// a gutter that fits the longest number, not a guess
const gutter = (lines: number) => `${String(lines).length + 1}ch`

export function FileView({ file, onClose }: { file: Node | null; onClose: () => void }) {
  const [read, setRead] = useState<Source | null>(null)

  useEffect(() => {
    setRead(null)
    if (!file) return
    let gone = false
    void sourceOf(file.path).then((found) => !gone && setRead(found))
    return () => void (gone = true)
  }, [file?.path])

  const lines = read?.text ? read.text.split("\n") : []

  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      className="max-w-4xl gap-3"
      title={
        file && (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <Kind folder={false} lang={file.lang ?? ""} />
              <span className="truncate font-mono text-sm font-medium">{file.path}</span>
            </span>
            <span className="text-muted-foreground text-xs">
              {file.lang ?? "no language"} · {num(file.code)} loc · {num(file.comment)} comment ·{" "}
              {num(file.commits)} commits · nest {nest(file)}
              {file.last && ` · last ${ago(file.last)}`}
            </span>
          </div>
        )
      }
    >
      {!read ? (
        <Note>loading…</Note>
      ) : read.binary ? (
        <Note>{weight(read.bytes)} of binary, so there is nothing to read here.</Note>
      ) : (
        <>
          <div className="bg-muted/20 max-h-[65vh] overflow-auto rounded-md border">
            <div className="flex min-w-max items-start text-xs leading-5">
              <pre
                aria-hidden
                style={{ width: gutter(lines.length) }}
                className="text-muted-foreground/60 bg-muted/40 sticky left-0 shrink-0 border-r py-2 pr-2 text-right tabular-nums select-none"
              >
                {lines.map((_, i) => i + 1).join("\n")}
              </pre>
              <pre className="px-3 py-2">{read.text}</pre>
            </div>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>
              {weight(read.bytes)}
              {read.clipped &&
                ` · shown to line ${num(lines.length)}, the rest is too much to hold`}
            </span>
            <CopyButton
              className="ml-auto"
              label="Copy the file"
              text={() => read.text}
              message={`${file?.name} copied`}
            />
          </div>
        </>
      )}
    </Dialog>
  )
}
