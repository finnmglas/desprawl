// owner: finn
// goal: typing
// inspo: shadcn

import * as React from "react"
import { cn } from "../lib/ui.ts"

export const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring/50 h-8 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2",
      className,
    )}
    {...props}
  />
)

export const Select = ({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={cn(
      "border-input bg-background focus-visible:ring-ring/50 h-8 cursor-pointer rounded-md border px-2 text-sm outline-none focus-visible:ring-2",
      className,
    )}
    {...props}
  />
)
