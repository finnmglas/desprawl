// owner: finn
// goal: guide user navigation

import { Card, CardContent, CardHeader, CardTitle } from "../atoms/card.tsx"
import { num, plural } from "../../lib/format.ts"
import type { Stats } from "../../../src/model.ts"

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
      to: "Files",
      title: "Walk the tree",
      desc: `${num(stats.files)} files in ${plural(folders, "top level folder")}, with the language split per folder and churn beside it`,
    },
    {
      to: "History",
      title: "Read the history",
      desc: `${num(stats.log.length)} commits as a branch graph, sized by the lines each moved`,
    },
  ].filter((link) => link.to !== current)

  return (
    <>
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
    </>
  )
}
