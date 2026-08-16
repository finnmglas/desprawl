// owner: finn
// goal: returning to where you actually came from

import { useGoing } from "../../lib/going.tsx"
import { useHunt } from "../../lib/sections.ts"

const said = (view: { tab: string; path: string[] }, tab: string) =>
  view.tab === tab ? (view.path.length ? view.path.join("/") : "where you were") : view.tab

export function Back() {
  const { at, was, go } = useGoing()
  const hunting = useHunt()
  // a tab opened first has nothing behind it, and the summary is the sensible floor
  const to = was && !(was.tab === at.tab && was.path.join("/") === at.path.join("/")) ? was : null

  if (hunting) return null
  return (
    <button
      data-print="hide"
      onClick={() => (to ? history.back() : go({ tab: "Overview" }))}
      title={to ? "Back to where you came from" : "Back to the summary"}
      className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs"
    >
      ← {to ? said(to, at.tab) : "Overview"}
    </button>
  )
}
