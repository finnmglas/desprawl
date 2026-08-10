// owner: finn
// goal: a small labelled fact
// inspo: shadcn

import * as React from "react"
import { cn, Slot, variants, type VariantProps } from "../../lib/ui.ts"

export const badgeVariants = variants(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-transparent",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        destructive: "bg-destructive border-transparent text-white",
        outline: "text-foreground",
      },
    },
    defaults: { variant: "default" },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

export function Badge({ className, variant, asChild, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span"
  return <Comp className={cn(badgeVariants({ variant, class: className }))} {...props} />
}
