// owner: finn
// goal: click folders, see loc per language

import { useMemo, useState } from "react"
import { Badge } from "../components/badge.tsx"
import { Button } from "../components/button.tsx"
import { DataTable, type Column } from "../components/data-table.tsx"
import { Distribution } from "../components/distribution.tsx"
import { Input } from "../components/input.tsx"
import { toast } from "../components/toast.tsx"
import { copy } from "../lib/export.ts"
import { churn, day, nest, num, pct, tokens } from "../lib/format.ts"
import { cn } from "../lib/ui.ts"
import type { Node, Stats } from "../../src/model.ts"

// a row's own lines, the denominator when reading shares within a row
const lines = (n: Node) => n.code + n.comment + n.blank

const walk = (root: Node, path: string[]): Node =>
  path.reduce<Node>((at, part) => at.children?.find((c) => c.name === part) ?? at, root)

export interface ExplorerProps {
  stats: Stats
  path: string[]
  setPath: (path: string[]) => void
  lang: string
  setLang: (lang: string) => void
}

export function Explorer({ stats, path, setPath, lang, setLang }: ExplorerProps) {
  const [filter, setFilter] = useState("")

  const here = useMemo(() => walk(stats.tree, path), [stats.tree, path])

  const rows = useMemo(
    () =>
      (here.children ?? []).filter((c) =>
        filter ? c.name.toLowerCase().includes(filter.toLowerCase()) : true,
      ),
    [here, filter],
  )

  // share of the picked language inside each row, painted as a bar
  const langTotal = lang ? (here.langs[lang] ?? 0) : 0

  const enter = (node: Node) => {
    if (node.children) return setPath([...path, node.name])
    toast(node.path, `${num(node.code)} loc · ${node.commits} commits · nest ${nest(node)}`)
  }

  // prettier-ignore
  const columns: Column<Node>[] = [
    {
      key: "name",
      label: `${num(here.files)} files`,
      get: (n) => (n.children ? `${n.name}/` : n.name),
      cell: (n) => (
        <span className="flex items-center gap-2">
          <span className={cn("font-mono text-xs", n.children && "font-medium")}>
            {n.children ? `${n.name}/` : n.name}
          </span>
          {!n.children && n.lang && <Badge variant="outline">{n.lang}</Badge>}
        </span>
      ),
    },
    { key: "code", label: "loc", num: true, get: (n) => n.code, cell: (n) => num(n.code), ofRow: lines },
    { key: "pct", label: "pct", num: true, get: (n) => n.code / (here.code || 1), cell: (n) => pct(n.code, here.code) },
    { key: "comment", label: "comment", num: true, get: (n) => n.comment, cell: (n) => num(n.comment), ofRow: lines },
    { key: "blank", label: "blank", num: true, get: (n) => n.blank, cell: (n) => num(n.blank), ofRow: lines },
    { key: "files", label: "files", num: true, get: (n) => n.files, cell: (n) => num(n.files) },
    { key: "chars", label: "chars", num: true, get: (n) => n.chars, cell: (n) => num(n.chars) },
    { key: "tok", label: "~tok", num: true, get: (n) => tokens(n.chars), cell: (n) => num(tokens(n.chars)) },
    { key: "nest", label: "nest", num: true, get: (n) => Number(nest(n)) },
    { key: "commits", label: "com", num: true, get: (n) => n.commits, cell: (n) => num(n.commits) },
    { key: "churn", label: "churn", num: true, get: (n) => churn(n), cell: (n) => num(churn(n)) },
    { key: "last", label: "last", num: true, get: (n) => day(n.last) },
  ]

  return (
    <div className="flex flex-col gap-3">
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
        <div className="ml-auto flex items-center gap-2">
          {path.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPath(path.slice(0, -1))}>
              up
            </Button>
          )}
          <Input
            className="w-44"
            placeholder="filter"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <DataTable
          className="lg:col-span-2"
          title={path.length ? path.join("/") : "/"}
          hint={lang ? `shaded by ${lang} share` : "click a folder to descend"}
          columns={columns}
          rows={rows}
          id={(n) => n.path}
          onRowClick={enter}
          rowStyle={(n) =>
            lang
              ? {
                  backgroundImage: "linear-gradient(var(--chart-2), var(--chart-2))",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${((n.langs[lang] ?? 0) / (langTotal || 1)) * 100}% 100%`,
                }
              : undefined
          }
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={async () =>
              toast(
                (await copy(JSON.stringify(here, null, 2)))
                  ? `Copied ${path.join("/") || "/"} as json`
                  : "Copy blocked by the browser",
                `${num(here.files)} files, with every child`,
              )
            }
          >
            json
          </Button>
        </DataTable>

        <Distribution
          title={path.length ? `${path.join("/")} languages` : "Languages"}
          langs={here.langs}
          selected={lang}
          onSelect={setLang}
        />
      </div>
    </div>
  )
}
