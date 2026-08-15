// owner: finn
// goal: dense rows, numbers right
// inspo: shadcn

import * as React from "react"
import { cn } from "../../lib/ui.ts"

/** the box around the table is the scrolling ancestor, so anything sticky inside sticks
 * to it: a second box outside this one would swallow the stick instead */
type Sheet = React.HTMLAttributes<HTMLTableElement> & {
  box?: string
  boxStyle?: React.CSSProperties
  boxRef?: React.Ref<HTMLDivElement>
}

export const Table = ({ className, box, boxStyle, boxRef, ...props }: Sheet) => (
  <div ref={boxRef} className={cn("w-full overflow-x-auto", box)} style={boxStyle}>
    <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>
)

export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("[&_tr]:border-b", className)} {...props} />
)

export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
)

export const TR = ({ className, ...props }: React.ComponentProps<"tr">) => (
  <tr className={cn("hover:bg-muted/50 border-b transition-colors", className)} {...props} />
)

// num right-aligns and tabular-figures the cell
type Cell = React.ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }

export const TH = ({ className, num, ...props }: Cell) => (
  <th
    className={cn(
      "text-muted-foreground h-8 px-2 text-left align-middle text-xs font-medium",
      num && "text-right",
      className,
    )}
    {...props}
  />
)

export const TD = ({ className, num, ...props }: Cell) => (
  <td
    className={cn("px-2 py-1.5 align-middle", num && "text-right tabular-nums", className)}
    {...props}
  />
)
