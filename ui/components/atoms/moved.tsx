// owner: finn
// goal: lines added and removed, coloured the one way

import { num } from "../../lib/text/format.ts"
import { ADDED, REMOVED } from "../../lib/draw/series.ts"
import { cn } from "../../lib/app/ui.ts"

export function Moved({
  n,
  kind,
  className,
  style,
}: {
  n: number
  kind: "ins" | "del"
  className?: string
  /** a backdrop bar, where the row has one */
  style?: React.CSSProperties
}) {
  return (
    <span
      className={cn("tabular-nums", className)}
      style={{ color: kind === "ins" ? ADDED : REMOVED, ...style }}
    >
      {kind === "ins" ? "+" : "-"}
      {num(n)}
    </span>
  )
}
