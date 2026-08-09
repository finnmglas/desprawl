// owner: finn
// goal: click folders, see loc per language

import { useEffect, useMemo, useState } from "react"
import { Badge } from "../components/badge.tsx"
import { Button } from "../components/button.tsx"
import { DataTable, type Column } from "../components/data-table.tsx"
import { withShare } from "../lib/columns.ts"
import { Distribution } from "../components/distribution.tsx"
import { Input } from "../components/input.tsx"
import { Onward } from "../components/onward.tsx"
import { CopyButton } from "../components/copy-button.tsx"
import { toast } from "../components/toast.tsx"
import { nest, num, pct } from "../lib/format.ts"
import { filesIn } from "../lib/live.ts"
import { cn } from "../lib/ui.ts"
import type { Node, Stats } from "../../src/model.ts"

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
}

export function Explorer({ stats, onTab, path, setPath, lang, setLang }: ExplorerProps) {
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

  // share of the picked language inside each row, painted as a bar
  const langTotal = lang ? (here.langs[lang] ?? 0) : 0

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
          <span className={cn("font-mono text-xs", n.children && "font-medium")}>
            {n.children ? `${n.name}/` : n.name}
          </span>
          {!n.children && n.lang && <Badge variant="outline">{n.lang}</Badge>}
        </span>
      ),
    },
    // prettier-ignore
    ...withShare({ key: "pct", label: "pct", num: true, get: (n) => n.code / (here.code || 1), cell: (n) => pct(n.code, here.code) }),
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

      <div className="grid gap-3 lg:grid-cols-3">
        <DataTable
          className="lg:col-span-2"
          title={path.length ? path.join("/") : "/"}
          hint={
            here.leaves && !fetched[key]
              ? `loading ${num(here.leaves)} files`
              : lang
                ? `shaded by ${lang} share`
                : "click a folder to descend"
          }
          columns={columns}
          rows={rows}
          id={(n) => n.path}
          fold={100}
          onRowClick={enter}
          rowStyle={(n) =>
            lang
              ? {
                  backgroundImage: "linear-gradient(var(--chart-2), var(--chart-2))",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${(own(n, lang) / (langTotal || 1)) * 100}% 100%`,
                }
              : undefined
          }
        >
          <CopyButton
            label="json"
            text={() => JSON.stringify(here, null, 2)}
            message={`Copied ${path.join("/") || "/"} as json`}
            note={`${num(here.files)} files, with every child`}
          />
        </DataTable>

        <Distribution
          title={path.length ? `${path.join("/")} languages` : "Languages"}
          langs={here.langs}
          selected={lang}
          onSelect={setLang}
        />
      </div>

      <Onward stats={stats} current="Files" onTab={onTab} />
    </div>
  )
}
