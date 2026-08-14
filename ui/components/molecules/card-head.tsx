// owner: finn
// goal: card, name, content, controls

import { CardHeader, CardTitle, Note } from "../atoms/card.tsx"
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
    <CardHeader
      className={cn("relative flex-row flex-wrap items-center gap-2", wrap && "flex-wrap")}
    >
      {/* the controls drop under the name on a narrow screen rather than squeezing it into
          a column two words wide */}
      <div className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 sm:basis-auto">
        <CardTitle>{title}</CardTitle>
        {hint && <Note>{hint}</Note>}
      </div>
      {children}
    </CardHeader>
  )
}
