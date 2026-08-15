// owner: finn
// goal: click folders, see loc per language

import { useEffect, useMemo, useState } from "react"
import { Badge } from "../components/atoms/badge.tsx"
import { Button } from "../components/atoms/button.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { withShare } from "../lib/columns.ts"

import { FileView } from "../components/molecules/file-view.tsx"
import { Section } from "../components/atoms/section.tsx"
import { Kind } from "../components/molecules/mark.tsx"
import { Tip } from "../components/atoms/tip.tsx"
import { num, pct } from "../lib/format.ts"
import { filesIn, isLive } from "../lib/live.ts"
import { useGoing } from "../lib/going.tsx"
import type { Matrix } from "../lib/formats.ts"
import { mainly } from "../lib/tint.ts"
import { lengthOf, spreadOf } from "../lib/verdict.ts"
import { cn } from "../lib/ui.ts"
import type { Node, Stats } from "../../src/model.ts"

// which line count a row can be shaded by
const SPLIT: Record<string, (n: Node) => number> = {
  Code: (n) => n.code,
  Comments: (n) => n.comment,
  Blank: (n) => n.blank,
}

// rows past this fold sit behind the table's own "show more"
const FOLD = 12

// what opening it would show. A served tree carries directories only, and counts the rest
const entries = (n: Node) => (n.children ? n.children.length + (n.leaves ?? 0) : 0)

// files carry no langs map, their one language is the file itself
const own = (n: Node, lang: string): number =>
  n.children ? (n.langs[lang] ?? 0) : n.lang === lang ? n.code : 0

const walk = (root: Node, path: string[]): Node =>
  path.reduce<Node>((at, part) => at.children?.find((c) => c.name === part) ?? at, root)

const flatten = (node: Node): Matrix => {
  const rows: Matrix = [["path", "code", "comment", "blank", "files", "commits", "last"]]
  const walk = (one: Node) => {
    rows.push([one.path, one.code, one.comment, one.blank, one.files, one.commits, one.last])
    one.children?.forEach(walk)
  }
  walk(node)
  return rows
}

export function Explorer({ stats }: { stats: Stats }) {
  const { at, go, open } = useGoing()
  const { path, lang, kind, pick } = at
  const setPath = (next: string[]) => go({ path: next, pick: "" })
  // the panel's own name is the way back to nothing chosen: no folder, no shading
  const reset = () => go({ path: [], pick: "", lang: "", kind: "" })
  const setLang = (next: string) => go({ lang: next, kind: "" })
  const setKind = (next: string) => go({ kind: next, lang: "" })

  // a served tree is directories only, files arrive on open
  const [fetched, setFetched] = useState<Record<string, Node[]>>({})
  // only a served run has the file itself, a saved page has the counts of it
  const [opened, setOpened] = useState<Node | null>(null)
  const live = isLive()

  const here = useMemo(() => walk(stats.tree, path), [stats.tree, path])
  const key = path.join("/")

  useEffect(() => {
    if (!here.leaves || fetched[key]) return
    void filesIn(key).then((files) => setFetched((prev) => ({ ...prev, [key]: files })))
  }, [key, here.leaves])

  // the table folds and searches these itself, so nothing is filtered on the way in
  const rows = useMemo(
    () => [...(here.children ?? []), ...(fetched[key] ?? [])],
    [here, fetched, key],
  )

  // share of whatever is picked inside each row, painted as a bar
  const langTotal = lang ? (here.langs[lang] ?? 0) : 0
  const share = (n: Node) => (kind ? SPLIT[kind](n) : own(n, lang))
  const whole = kind ? SPLIT[kind](here) : langTotal

  // the root is allowed its config and docs, a folder inside it is not
  const standing = spreadOf(entries(here), undefined, !path.length)

  // a folder descends, a file is read: the one thing clicking either can mean
  const enter = (node: Node) => {
    if (node.children) return setPath([...path, node.name])
    if (live) return setOpened(node)
    open({ kind: "file", id: node.path })
  }

  const columns: Column<Node>[] = [
    {
      key: "name",
      label: `${num(here.files)} files`,
      hint: "click a folder to descend, a file to read it",
      get: (n) => (n.children ? `${n.name}/` : n.name),
      cell: (n) => (
        <span className="flex items-center gap-2">
          <Kind folder={!!n.children} lang={n.children ? mainly(n.langs) : (n.lang ?? "")} />
          <span className={cn("font-mono text-xs", n.children && "font-medium")}>
            {n.children ? `${n.name}/` : n.name}
          </span>
        </span>
      ),
    },
    {
      key: "spread",
      label: "spread",
      num: true,
      flat: true,
      left: true,
      // the label rather than the count behind it: sorting then groups the bands, and a
      // folder's entries and a file's lines are two scales one number could not carry
      get: (n) => (n.children ? spreadOf(entries(n)).label : lengthOf(n.code).label),
      // a folder wears its band as a badge and a file says it in words, so the column
      // itself tells the two apart before anyone reads it
      cell: (n) => {
        if (!n.children) {
          const band = lengthOf(n.code)
          return (
            <Tip text={band.why}>
              <span className={cn("text-xs", band.tone)}>{band.label}</span>
            </Tip>
          )
        }
        const band = spreadOf(entries(n))
        return (
          <Tip text={band.why}>
            <Badge variant="outline" className={band.tone}>
              {band.label}
            </Badge>
          </Tip>
        )
      },
      hint: "a folder by what is in it, a file by how long it is",
    },
    // prettier-ignore
    ...withShare({ key: "pct", label: "pct", num: true, get: (n) => n.code / (here.code || 1), cell: (n) => pct(n.code, here.code) }),
  ]

  return (
    // contents, so both sections are Overview's own items and reorder against its panels
    <div className="contents">
      <Section id="tree_files" className="flex min-w-0 flex-col gap-3">
        <DataTable
          className="min-w-0"
          // the panel is called Files, and the path only joins it once there is one:
          // every segment walks back to itself, so no crumb bar and no up button beside it
          title={
            <span className="flex flex-wrap items-center gap-1">
              <button onClick={reset} className="hover:text-foreground cursor-pointer">
                Files
              </button>
              {path.map((part, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-muted-foreground font-normal">/</span>
                  <button
                    onClick={() => setPath(path.slice(0, i + 1))}
                    className="hover:text-foreground cursor-pointer font-mono"
                  >
                    {part}
                  </button>
                </span>
              ))}
              {/* the folder you are standing in, judged like the ones listed inside it,
                  beside its own name rather than lost among the controls */}
              <Tip text={standing.why}>
                <Badge variant="outline" className={cn("ml-1", standing.tone)}>
                  {standing.label}
                </Badge>
              </Tip>
            </span>
          }
          file={`${path.join("-") || "root"}-tree`}
          hint={
            here.leaves && !fetched[key]
              ? `loading ${num(here.leaves)} files`
              : lang || kind
                ? `shaded by ${lang || kind.toLowerCase()} share`
                : live
                  ? "click a folder to descend, a file to read it"
                  : "click a folder to descend, a file to see where it leads"
          }
          columns={columns}
          rows={rows}
          id={(n) => n.path}
          fold={FOLD}
          saves={[
            {
              name: `${path.join("-") || "root"}-tree`,
              label: "Folder tree",
              note: `${num(here.files)} files, every child of ${path.join("/") || "/"}, as`,
              rows: () => flatten(here),
            },
          ]}
          onRowClick={enter}
          mark={(n) => !!pick && n.path === pick}
          rowStyle={(n) =>
            lang || kind
              ? {
                  // washed rather than solid: the bar is behind the numbers, not over them
                  backgroundImage:
                    "linear-gradient(color-mix(in oklch, var(--chart-2) var(--wash), transparent), color-mix(in oklch, var(--chart-2) var(--wash), transparent))",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${(share(n) / (whole || 1)) * 100}% 100%`,
                }
              : undefined
          }
        >
          {/* what the reader came here to see, said rather than left to be spotted */}
          {pick && (
            <Button variant="outline" size="sm" onClick={() => go({ pick: "" })}>
              {pick.split("/").pop()} ✕
            </Button>
          )}
          {/* a language arrives from the Languages table, and leaves from here */}
          {lang && (
            <Button variant="outline" size="sm" onClick={() => setLang("")}>
              {lang} ✕
            </Button>
          )}
          {/* picking the one already on clears it, so there is no "all" to reach for */}
          <div className="flex items-center gap-0.5">
            {Object.keys(SPLIT).map((one) => (
              <Button
                key={one}
                size="sm"
                variant={kind === one ? "secondary" : "ghost"}
                className="text-muted-foreground h-6 px-1.5 text-xs font-normal data-[on]:text-inherit"
                data-on={kind === one || undefined}
                onClick={() => setKind(kind === one ? "" : one)}
              >
                {one.toLowerCase()}
              </Button>
            ))}
          </div>
        </DataTable>
      </Section>

      <FileView
        path={opened?.path ?? ""}
        node={opened ?? undefined}
        onClose={() => setOpened(null)}
      />
    </div>
  )
}
