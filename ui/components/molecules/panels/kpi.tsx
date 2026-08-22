// owner: finn
// goal: one number, what it means, and where it leads

import { Card, CardContent, CardHeader, CardTitle } from "../../atoms/card.tsx"
import { Tip } from "../../atoms/tip.tsx"
import { Arrow } from "../../atoms/icons.tsx"
import { TONES, type Verdict } from "../../../lib/say/verdict.ts"
import { num } from "../../../lib/say/format.ts"
import { cn } from "../../../lib/app/ui.ts"
import type { Moved } from "../../../lib/say/trend.ts"

/** which way it went, beside the number it went from. Nothing at all when it went nowhere,
 * since a row of zeroes says only that the window was quiet */
function Trend({ moved, what }: { moved: Moved; what: string }) {
  if (!moved.by || !moved.over) return null
  const up = moved.by > 0
  return (
    <Tip text={`${what} ${moved.over}`} side="bottom">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-sm font-medium",
          up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
        )}
      >
        <Arrow up={up} className="size-3.5" />
        {num(Math.abs(moved.by))}
      </span>
    </Tip>
  )
}

export function Kpi({
  label,
  value,
  sub,
  verdict,
  moved,
  says,
  opens,
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  verdict: Verdict
  /** how it moved over the window the reader picked, where that can be read at all */
  moved?: Moved
  /** what that movement is, in words, since a delta alone does not say what it counted */
  says?: string
  /** the tab it opens, when it opens one */
  opens?: string
  onClick?: () => void
}) {
  return (
    <Card
      onClick={onClick}
      // no native title here: the browser's own tooltip would cover the badge's
      aria-label={opens && `Open ${opens}`}
      className={cn(onClick && "hover:border-ring cursor-pointer transition-colors")}
    >
      <CardHeader className="flex-row items-start gap-2">
        <CardTitle className="text-muted-foreground">{label}</CardTitle>
        <Tip text={verdict.why} side="bottom" className="ml-auto">
          <span
            className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONES[verdict.tone])}
          >
            {verdict.label}
          </span>
        </Tip>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {moved && <Trend moved={moved} what={says ?? label} />}
        </div>
        <div className="text-muted-foreground text-xs">{sub}</div>
      </CardContent>
    </Card>
  )
}

// two across is half a phone each
export const Kpis = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:gap-6 lg:grid-cols-4">
    {children}
  </div>
)
