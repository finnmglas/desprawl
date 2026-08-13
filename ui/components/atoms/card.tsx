// owner: finn
// goal: a bounded surface
// inspo: shadcn

import * as React from "react"
import { cn } from "../../lib/ui.ts"

type Div = React.HTMLAttributes<HTMLDivElement>

export const Card = ({ className, ...props }: Div) => (
  <div
    className={cn("bg-card text-card-foreground flex flex-col rounded-lg border", className)}
    {...props}
  />
)

export const CardHeader = ({ className, ...props }: Div) => (
  <div className={cn("flex flex-col gap-1 px-4 pt-4", className)} {...props} />
)

export const CardTitle = ({ className, ...props }: Div) => (
  <div className={cn("text-sm font-medium leading-none", className)} {...props} />
)

export const CardContent = ({ className, ...props }: Div) => (
  <div className={cn("p-4", className)} {...props} />
)

/** the muted caption beside a number, a label or a control */
export const Note = ({ className, ...props }: Div) => (
  <span className={cn("text-muted-foreground text-xs", className)} {...props} />
)
