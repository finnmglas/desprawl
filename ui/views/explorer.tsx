// owner: finn
// goal: click folders, see loc per language

import { useEffect, useMemo, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Badge } from "../components/atoms/badge.tsx"
import { Button } from "../components/atoms/button.tsx"
import { DataTable, type Column } from "../components/molecules/data-table.tsx"
import { withShare } from "../lib/columns.ts"
import { Distribution } from "../components/molecules/distribution.tsx"
import { Input } from "../components/atoms/input.tsx"
import { Kind } from "../components/molecules/mark.tsx"
import { Onward } from "../components/molecules/onward.tsx"
import { Tip } from "../components/atoms/tip.tsx"
import { toast } from "../components/atoms/toast.tsx"
import { nest, num, pct } from "../lib/format.ts"
import { filesIn } from "../lib/live.ts"
import type { Matrix } from "../lib/formats.ts"
import { mainly } from "../lib/tint.ts"
import { spreadOf } from "../lib/verdict.ts"
import { cn } from "../lib/ui.ts"
import type { Node, Stats } from "../../src/model.ts"

// what a line is, since none of the three has a brand colour to borrow
const SPLIT: Record<string, { paint: string; of: (n: Node) => number }> = {
  Code: { paint: "var(--chart-1)", of: (n) => n.code },
  Comments: { paint: "var(--chart-4)", of: (n) => n.comment },
  Blank: { paint: "var(--muted-foreground)", of: (n) => n.blank },
}

// what opening it would show. A served tree carries directories only, and counts the rest
const entries = (n: Node) => (n.children ? n.children.length + (n.leaves ?? 0) : 0)

// files carry no langs map, their one language is the file itself
const own = (n: Node, lang: string): number =>
  n.children ? (n.langs[lang] ?? 0) : n.lang === lang ? n.code : 0

const walk = (root: Node, path: string[]): Node =>
  path.reduce<Node>((at, part) => at.children?.find((c) => c.name === part) ?? at, root)

export interface ExplorerProps {
  stats: Stats
  onTab: (tab: string) => void
  path: string[]
  setPath: (path: string[]) => void
  lang: string
  setLang: (lang: string) => void
  /** a line kind shades the rows the same way a language does, and only one at a time */
  kind: string
  setKind: (kind: string) => void
}

const flatten = (node: Node): Matrix => {
  const rows: Matrix = [["path", "code", "comment", "blank", "files", "commits", "last"]]
  const walk = (one: Node) => {
    rows.push([one.path, one.code, one.comment, one.blank, one.files, one.commits, one.last])
    one.children?.forEach(walk)
  }
  walk(node)
  return rows
}

export function Explorer({
  stats,
  onTab,
  path,
  setPath,
  lang,
  setLang,
  kind,
  setKind,
}: ExplorerProps) {
  const [filter, setFilter] = useState("")
  // a served tree is directories only, files arrive on open
  const [fetched, setFetched] = useState<Record<string, Node[]>>({})

  const here = useMemo(() => walk(stats.tree, path), [stats.tree, path])
  const key = path.join("/")

  useEffect(() => {
    if (!here.leaves || fetched[key]) return
    void filesIn(key).then((files) => setFetched((prev) => ({ ...prev, [key]: files })))
  }, [key, here.leaves])

  const rows = useMemo(
    () =>
      [...(here.children ?? []), ...(fetched[key] ?? [])].filter((c) =>
        filter ? c.name.toLowerCase().includes(filter.toLowerCase()) : true,
      ),
    [here, filter, fetched, key],
  )

  // share of whatever is picked inside each row, painted as a bar
  const langTotal = lang ? (here.langs[lang] ?? 0) : 0
  const share = (n: Node) => (kind ? SPLIT[kind].of(n) : own(n, lang))
  const whole = kind ? SPLIT[kind].of(here) : langTotal

  // the root is allowed its config and docs, a folder inside it is not
  const standing = spreadOf(entries(here), undefined, !path.length)

  const enter = (node: Node) => {
    if (node.children) return setPath([...path, node.name])
    toast(node.path, `${num(node.code)} loc · ${node.commits} commits · nest ${nest(node)}`)
  }

  const columns: Column<Node>[] = [
    {
      key: "name",
      label: `${num(here.files)} files`,
      hint: "everything under this folder, click one to descend",
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
      // a served tree carries directories only, and counts the files it left out
      get: entries,
      cell: (n) => {
        if (!n.children) return null
        const band = spreadOf(entries(n))
        return (
          <Tip text={band.why}>
            <Badge variant="outline" className={band.tone}>
              {band.label}
            </Badge>
          </Tip>
        )
      },
      hint: "what opening the folder would show: the files and subfolders directly inside it",
    },
    // prettier-ignore
    ...withShare({ key: "pct", label: "pct", num: true, get: (n) => n.code / (here.code || 1), cell: (n) => pct(n.code, here.code) }),
  ]

  return (
    <div className="flex flex-col gap-3">
      <Back onTab={onTab} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" onClick={() => setPath([])}>
            {stats.repo.split("/").pop()}
          </Button>
          {path.map((part, i) => (
            <span key={part} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <Button variant="ghost" size="sm" onClick={() => setPath(path.slice(0, i + 1))}>
                {part}
              </Button>
            </span>
          ))}
        </div>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          {path.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPath(path.slice(0, -1))}>
              up
            </Button>
          )}
          <Input
            className="w-full sm:w-44"
            placeholder="filter"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* a grid cell is as wide as its content unless told otherwise, and a wide table
          would push the page sideways rather than scroll inside its own card */}
      <div className="grid min-w-0 gap-3 lg:grid-cols-3">
        <DataTable
          className="min-w-0 lg:col-span-2"
          title={path.length ? path.join("/") : "/"}
          hint={
            here.leaves && !fetched[key]
              ? `loading ${num(here.leaves)} files`
              : lang || kind
                ? `shaded by ${lang || kind.toLowerCase()} share`
                : "click a folder to descend"
          }
          columns={columns}
          rows={rows}
          id={(n) => n.path}
          fold={100}
          saves={[
            {
              name: `${path.join("-") || "root"}-tree`,
              label: "Folder tree",
              note: `${num(here.files)} files, every child of ${path.join("/") || "/"}, as`,
              rows: () => flatten(here),
            },
          ]}
          onRowClick={enter}
          rowStyle={(n) =>
            lang || kind
              ? {
                  backgroundImage: "linear-gradient(var(--chart-2), var(--chart-2))",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${(share(n) / (whole || 1)) * 100}% 100%`,
                }
              : undefined
          }
        >
          {/* the folder you are standing in, judged like the ones listed inside it */}
          <Tip text={standing.why}>
            <Badge variant="outline" className={standing.tone}>
              {standing.label}
            </Badge>
          </Tip>
        </DataTable>

        <div className="flex min-w-0 flex-col gap-3">
          <Distribution
            title={path.length ? `${path.join("/")} languages` : "Languages"}
            langs={here.langs}
            selected={lang}
            onSelect={(next) => {
              setKind("")
              setLang(next)
            }}
          />
          <Distribution
            title="Lines"
            langs={{ Code: here.code, Comments: here.comment, Blank: here.blank }}
            paint={(name) => SPLIT[name].paint}
            selected={kind}
            onSelect={(next) => {
              setLang("")
              setKind(next)
            }}
          />
        </div>
      </div>

      <Onward stats={stats} current="Files" onTab={onTab} />
    </div>
  )
}
