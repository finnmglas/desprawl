// owner: finn
// goal: every file this page can hand you

import { useState } from "react"
import { Button } from "../atoms/button.tsx"
import { Dialog } from "../atoms/dialog.tsx"
import { Download } from "../atoms/icons.tsx"
import { Note } from "../atoms/card.tsx"
import { toast } from "../atoms/toast.tsx"
import { download, named } from "../../lib/app/export.ts"
import { num } from "../../lib/say/format.ts"
import { knowledge } from "../../../src/facts/knowledge.ts"
import { balanced, fold } from "../../../src/read/layers.ts"
import { callGraph, importGraph, isLive, staticPage } from "../../lib/app/live.ts"
import { notes } from "../../lib/app/paper.ts"
import { slides } from "../../lib/app/slides.ts"
import type { Stats } from "../../../src/read/model.ts"

/** one file on offer */
function Row({
  label,
  what,
  run,
}: {
  label: string
  what: string
  run: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <Note>{what}</Note>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await run()
          } finally {
            setBusy(false)
          }
        }}
      >
        <Download />
        {busy ? "working…" : "save"}
      </Button>
    </div>
  )
}

const Group = ({ label }: { label: string }) => (
  <div className="text-muted-foreground mt-1 text-xs font-medium">{label}</div>
)

export function Exports({
  open,
  onClose,
  stats,
  onPaper,
}: {
  open: boolean
  onClose: () => void
  stats: Stats
  /** renders every tab at once and paints them into one file */
  onPaper?: (kind: "pdf" | "pptx") => void
}) {
  const live = isLive()
  // a static page carries both graphs
  const heldGraph = window.__DESPRAWL_GRAPH__
  const heldCalls = window.__DESPRAWL_CALLS__

  const paper = (kind: "pdf" | "pptx") => {
    onClose()
    onPaper?.(kind)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <>
          <div className="text-base font-semibold">Export data</div>
          <Note>Written by your browser, straight to your downloads</Note>
        </>
      }
    >
      <Group label="Data" />
      <Row
        label="git-stats (json)"
        what="the whole report, tree and series included"
        run={() => {
          const file = named("stats.json")
          download(file, JSON.stringify(stats, null, 2), "application/json")
          toast(file, "The whole report, tree and series included")
        }}
      />
      {(live || heldGraph) && (
        <Row
          label="import-graph (json)"
          what="every file, and what it imports"
          run={async () => {
            const got = await importGraph()
            if (!got) return
            const file = named("imports.json")
            download(file, JSON.stringify(got, null, 2), "application/json")
            toast(file, `${num(got.stats.edges)} imports between ${num(got.stats.files)} files`)
          }}
        />
      )}
      {(live || heldGraph) && (
        <Row
          label="knowledge-graph (json)"
          what="every module, file, declaration and install, and what relates them"
          run={async () => {
            const graph = await importGraph()
            if (!graph) return
            const split = balanced(graph)
            const found = knowledge(stats.repo, {
              graph,
              layout: fold(graph, split),
              calls: await callGraph(),
              grain: "declaration",
              split,
            })
            const file = named("knowledge.json")
            download(file, JSON.stringify(found, null, 2), "application/json")
            toast(file, `${num(found.things.length)} things, ${num(found.links.length)} relations`)
          }}
        />
      )}
      {(live || heldCalls) && (
        <Row
          label="call-graph (json)"
          what="every declaration, and what calls what"
          run={async () => {
            const got = await callGraph()
            if (!got) return
            const file = named("calls.json")
            download(file, JSON.stringify(got, null, 2), "application/json")
            toast(
              file,
              `${num(got.stats.symbols)} declarations, ${num(got.stats.edges)} calls between them`,
            )
          }}
        />
      )}

      <Group label="Documents" />
      {live && (
        <Row
          label="full static desprawl (html)"
          what="one file, both graphs inside it, works offline"
          run={async () => {
            const made = await staticPage()
            if (!made) return
            const file = named("desprawl.html")
            download(file, made, "text/html")
            toast(file, "The whole report in one file, with both graphs inside it")
          }}
        />
      )}
      {onPaper && (
        <>
          <Row
            label="every tab (pdf)"
            what="printed by your browser, so the text stays text"
            run={() => paper("pdf")}
          />
          <Row
            label="every tab (pptx)"
            what="each tab painted as it looks right now"
            run={() => paper("pptx")}
          />
        </>
      )}
      <Row
        label="panels as text (pptx)"
        what="the numbers as words, no pictures"
        run={async () => {
          const graph = heldGraph ?? (live ? await importGraph() : null)
          const made = slides(stats, graph)
          const file = named("desprawl-notes.pptx")
          await notes(made, stats.repo, file)
          toast(file, `${made.length} slides, the numbers as text`)
        }}
      />
    </Dialog>
  )
}
