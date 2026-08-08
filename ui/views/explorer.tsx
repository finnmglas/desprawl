// owner: finn
// goal: click folders, see loc per language

import { useMemo, useState } from "react"
import { Badge } from "../components/badge.tsx"
import { Button } from "../components/button.tsx"
import { Card, CardContent } from "../components/card.tsx"
import { Distribution } from "../components/distribution.tsx"
import { Input, Select } from "../components/input.tsx"
import { TBody, TD, TH, THead, TR, Table } from "../components/table.tsx"
import { toast } from "../components/toast.tsx"
import { churn, day, nest, num, pct, tokens } from "../lib/format.ts"
import { cn } from "../lib/ui.ts"
import type { Node, Stats } from "../../src/model.ts"

type Sort = "loc" | "churn" | "nest" | "name"

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
  const [sort, setSort] = useState<Sort>("loc")
  const [filter, setFilter] = useState("")

  const here = useMemo(() => walk(stats.tree, path), [stats.tree, path])

  const rows = useMemo(() => {
    const kids = (here.children ?? []).filter((c) =>
      filter ? c.name.toLowerCase().includes(filter.toLowerCase()) : true,
    )
    const by: Record<Sort, (a: Node, b: Node) => number> = {
      loc: (a, b) => b.code - a.code,
      churn: (a, b) => b.insertions + b.deletions - (a.insertions + a.deletions),
      nest: (a, b) => b.indent / (b.code || 1) - a.indent / (a.code || 1),
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return [...kids].sort(by[sort])
  }, [here, sort, filter])

  // share of the picked language inside each row, painted as a bar
  const langTotal = lang ? (here.langs[lang] ?? 0) : 0

  const enter = (node: Node) => {
    if (!node.children) {
      toast(node.name, `${num(node.code)} loc · ${node.commits} commits · nest ${nest(node)}`)
      return
    }
    setPath([...path, node.name])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-sm">
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
          <Input
            className="w-44"
            placeholder="filter"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
          />
          <Select value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
            <option value="loc">by loc</option>
            <option value="churn">by churn</option>
            <option value="nest">by nest</option>
            <option value="name">by name</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{num(here.files)} files</TH>
                <TH num>loc</TH>
                <TH num>pct</TH>
                <TH num>comment</TH>
                <TH num>blank</TH>
                <TH num>files</TH>
                <TH num>chars</TH>
                <TH num>~tok</TH>
                <TH num>nest</TH>
                <TH num>com</TH>
                <TH num>churn</TH>
                <TH num>last</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((node) => {
                const share = lang ? ((node.langs[lang] ?? 0) / (langTotal || 1)) * 100 : 0
                return (
                  <TR
                    key={node.path}
                    onClick={() => enter(node)}
                    className="cursor-pointer"
                    // the bar is the picked language's share of this row
                    style={
                      lang
                        ? {
                            backgroundImage: "linear-gradient(var(--chart-2), var(--chart-2))",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: `${share}% 100%`,
                            backgroundBlendMode: "normal",
                          }
                        : undefined
                    }
                  >
                    <TD>
                      <span className={cn("font-mono text-xs", node.children && "font-medium")}>
                        {node.children ? `${node.name}/` : node.name}
                      </span>
                      {!node.children && node.lang && (
                        <Badge variant="outline" className="ml-2">
                          {node.lang}
                        </Badge>
                      )}
                    </TD>
                    <TD num>{num(node.code)}</TD>
                    <TD num>{pct(node.code, here.code)}</TD>
                    <TD num>{num(node.comment)}</TD>
                    <TD num>{num(node.blank)}</TD>
                    <TD num>{num(node.files)}</TD>
                    <TD num>{num(node.chars)}</TD>
                    <TD num>{num(tokens(node.chars))}</TD>
                    <TD num>{nest(node)}</TD>
                    <TD num>{num(node.commits)}</TD>
                    <TD num>{num(churn(node))}</TD>
                    <TD num className="text-muted-foreground">
                      {day(node.last)}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </CardContent>
        </Card>

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
