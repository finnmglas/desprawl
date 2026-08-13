// owner: finn
// goal: guide user navigation

import { Card, CardContent, CardHeader, CardTitle } from "../atoms/card.tsx"
import { Back } from "../atoms/back.tsx"
import { Waiting } from "../atoms/waiting.tsx"
import { num, plural } from "../../lib/format.ts"
import type { Stats } from "../../../src/model.ts"

/** what a graph view shows until its graph arrives */
export function Loading({
  stats,
  current,
  onTab,
  what,
  slow = "Large repo takes a few seconds.",
  rows = 4,
}: {
  stats: Stats
  current: string
  onTab: (tab: string) => void
  what: string
  slow?: string
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-4">
      <Back onTab={onTab} />
      <Card>
        <CardContent className="p-4">
          <Waiting what={what} slow={slow} rows={rows} />
        </CardContent>
      </Card>
      <Onward stats={stats} current={current} onTab={onTab} />
    </div>
  )
}

export function Onward({
  stats,
  current,
  onTab,
}: {
  stats: Stats
  current: string
  onTab: (tab: string) => void
}) {
  const folders = (stats.tree.children ?? []).filter((c) => c.children).length

  const links = [
    {
      to: "Overview",
      title: "Back to the summary",
      desc: `${num(stats.code)} loc, ${plural(stats.contributors.length, "dev")}, languages and who wrote them`,
    },
    {
      to: "Modules",
      title: "See the structure",
      desc: "which folders depend on which, the levels they stack into, and the loops that stop any of them being moved",
    },
    {
      to: "Execution",
      title: "Follow the calls",
      desc: "which declarations everything leans on, which ones nothing reaches at all, and the names written twice",
    },
    {
      to: "Files",
      title: "Walk the tree",
      desc: `${num(stats.files)} files in ${plural(folders, "top level folder")}, with the language split per folder and churn beside it`,
    },
    {
      to: "History",
      title: "Read the history",
      desc: `${num(stats.log.length)} commits as a branch graph, sized by the lines each moved`,
    },
    {
      to: "Tasks",
      title: "See what there is to do",
      desc: "every cycle, dead declaration, licence and crowded folder the other tabs found, as work with a size on it",
    },
    {
      to: "Graph",
      title: "Look at the whole thing",
      desc: "every file a dot inside the module holding it, with imports one way and calls the other",
    },
  ].filter((link) => link.to !== current)

  return (
    <div data-print="hide" className="contents">
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <Card
            key={link.to}
            onClick={() => onTab(link.to)}
            title={`Open ${link.to}`}
            className="hover:border-ring cursor-pointer transition-colors"
          >
            <CardHeader>
              <CardTitle>{link.title} &rarr;</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground pt-0 text-xs">{link.desc}</CardContent>
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground text-center text-xs">
        desprawl {stats.version} ·{" "}
        <a
          className="hover:text-foreground underline"
          href="https://www.npmjs.com/package/desprawl"
        >
          npm
        </a>{" "}
        ·{" "}
        <a className="hover:text-foreground underline" href="https://github.com/finnmglas/desprawl">
          github
        </a>
      </p>
    </div>
  )
}
