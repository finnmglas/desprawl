// owner: finn
// goal: card, name, content, controls

import { CardHeader, CardTitle } from "../atoms/card.tsx"
import { cn } from "../../lib/ui.ts"

export function CardHead({
  title,
  hint,
  wrap,
  children,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  /** controls that would otherwise crowd a narrow header */
  wrap?: boolean
  children?: React.ReactNode
}) {
  return (
    <CardHeader className={cn("relative flex-row items-center gap-2", wrap && "flex-wrap")}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <CardTitle>{title}</CardTitle>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {children}
    </CardHeader>
  )
}
