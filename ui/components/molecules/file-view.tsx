// owner: finn
// goal: the file behind a row, read rather than counted

import { useEffect, useRef, useState } from "react"
import { Note } from "../atoms/card.tsx"
import { Dialog } from "../atoms/dialog.tsx"
import { Kind } from "./mark.tsx"
import { CopyButton } from "./copy-button.tsx"
import { ago, nest, num, weight } from "../../lib/format.ts"
import { sourceOf } from "../../lib/live.ts"
import { LANGS } from "../../../src/langs.ts"
import type { Source } from "../../../src/serve.ts"
import type { Node } from "../../../src/model.ts"

// fixed, so the line a caller asks for can be scrolled to and banded without measuring
const ROW = 20
// the py-2 above the first line, which every offset below sits under
const PAD = 8

// a gutter that fits the longest number, not a guess
const gutter = (lines: number) => `${String(lines).length + 1}ch`

const langOf = (path: string) => LANGS[path.split(".").pop()?.toLowerCase() ?? ""] ?? ""

export function FileView({
  path,
  node,
  line,
  onClose,
}: {
  /** empty closes it */
  path: string
  /** the counted row, when whoever opened it had one */
  node?: Node
  /** the line to land on, for a caller that pointed at a declaration */
  line?: number
  onClose: () => void
}) {
  const [read, setRead] = useState<Source | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRead(null)
    if (!path) return
    let gone = false
    void sourceOf(path).then((found) => !gone && setRead(found))
    return () => void (gone = true)
  }, [path])

  // a third down, so what leads up to it is on screen
  useEffect(() => {
    if (!read?.text || !line || !box.current) return
    box.current.scrollTop = Math.max(0, PAD + (line - 1) * ROW - box.current.clientHeight / 3)
  }, [read, line])

  const lines = read?.text ? read.text.split("\n") : []
  const lang = node?.lang ?? langOf(path)

  return (
    <Dialog
      open={!!path}
      onClose={onClose}
      className="max-w-4xl gap-3"
      title={
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <Kind folder={false} lang={lang} />
            <span className="truncate font-mono text-sm font-medium">{path}</span>
          </span>
          <span className="text-muted-foreground text-xs">
            {lang || "no known language"}
            {node && (
              <>
                {" "}
                · {num(node.code)} loc · {num(node.comment)} comment · {num(node.commits)} commits ·
                nest {nest(node)}
                {node.last && ` · last ${ago(node.last)}`}
              </>
            )}
            {line !== undefined && ` · line ${num(line)}`}
          </span>
        </div>
      }
    >
      {!read ? (
        <Note>loading…</Note>
      ) : read.binary ? (
        <Note>binary, {weight(read.bytes)}</Note>
      ) : (
        <>
          <div ref={box} className="bg-muted/20 max-h-[65vh] overflow-auto rounded-md border">
            <div className="relative flex min-w-max items-start text-xs leading-[20px]">
              {/* the line asked for, banded rather than scrolled to and left to be hunted */}
              {!!line && line <= lines.length && (
                <span
                  aria-hidden
                  style={{ top: PAD + (line - 1) * ROW, height: ROW }}
                  className="pointer-events-none absolute inset-x-0 bg-amber-400/20"
                />
              )}
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
              {read.clipped && ` · cut at line ${num(lines.length)}`}
            </span>
            <CopyButton
              className="ml-auto"
              label="Copy the file"
              text={() => read.text}
              message={`${path.split("/").pop()} copied`}
            />
          </div>
        </>
      )}
    </Dialog>
  )
}
