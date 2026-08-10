// owner: finn
// goal: one number, what it means, and where it leads

import { Card, CardContent, CardHeader, CardTitle } from "../atoms/card.tsx"
import { Tip } from "../atoms/tip.tsx"
import { TONES, type Verdict } from "../../lib/verdict.ts"
import { cn } from "../../lib/ui.ts"

export function Kpi({
  label,
  value,
  sub,
  verdict,
  opens,
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  verdict: Verdict
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
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-muted-foreground text-xs">{sub}</div>
      </CardContent>
    </Card>
  )
}
