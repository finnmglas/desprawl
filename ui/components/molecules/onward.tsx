// owner: finn
// goal: guide user navigation

import { Card, CardContent, CardHeader, CardTitle } from "../atoms/card.tsx"
import { Back } from "../atoms/back.tsx"
import { Eye, MARKS } from "../atoms/icons.tsx"
import { Waiting } from "../atoms/waiting.tsx"
import { useGoing } from "../../lib/going.tsx"
import { TAB_SECTIONS, useHidden } from "../../lib/sections.ts"
import type { Stats } from "../../../src/model.ts"

/** what a graph view shows until its graph arrives */
export function Loading({
  stats,
  current,
  what,
  slow = "Large repo takes a few seconds.",
  rows = 4,
}: {
  stats: Stats
  current: string
  what: string
  slow?: string
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-4">
      <Back />
      <Card>
        <CardContent className="p-4">
          <Waiting what={what} slow={slow} rows={rows} />
        </CardContent>
      </Card>
      <Onward stats={stats} current={current} />
    </div>
  )
}

export function Onward({ stats, current }: { stats: Stats; current: string }) {
  const { go } = useGoing()
  const [hidden, setHidden] = useHidden()
  const revealable = (TAB_SECTIONS[current] ?? []).filter((id) => hidden.includes(id))

  // the tab is the title, and what it holds is a handful of words under it
  const links = Object.entries({
    Overview: "size, languages, the file tree, who wrote them",
    Modules: "what depends on what, and the loops",
    Execution: "what is leaned on, what nothing reaches",
    History: "commits as a branch graph",
    Tasks: "what to do, with a size on each",
    Graph: "every file a dot, every import a line",
  }).filter(([to]) => to !== current)

  // contents makes these the flex parent's own items, each defaulting to order 0
  // and outranked by any reordered section, so they are pinned past every section id
  const last = { order: 999 }

  return (
    <div data-print="hide" className="contents">
      {revealable.length > 0 && (
        <div style={last} className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Hidden on this tab:</span>
          {revealable.map((id) => (
            <button
              key={id}
              onClick={() => setHidden(id, false)}
              className="hover:border-ring flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors"
            >
              <Eye className="size-3" />
              {id.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      )}

      <div style={last} className="grid gap-3 sm:grid-cols-2">
        {links.map(([to, why]) => (
          <Card
            key={to}
            onClick={() => go({ tab: to })}
            title={`Open ${to}`}
            className="hover:border-ring cursor-pointer transition-colors"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {MARKS[to]}
                {to} &rarr;
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground pt-0 text-xs">{why}</CardContent>
          </Card>
        ))}
      </div>

      <p style={last} className="text-muted-foreground text-center text-xs">
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
