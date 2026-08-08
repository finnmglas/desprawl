// owner: finn
// goal: hover message hint like shadcn but inverted

import { cn } from "../lib/ui.ts"

export function Tip({
  text,
  side = "top",
  className,
  children,
}: {
  text: React.ReactNode
  /** bottom keeps it inside a scrolling table, where a top one would be clipped */
  side?: "top" | "bottom"
  className?: string
  children: React.ReactNode
}) {
  // still wear the class, or a hintless label would style itself differently
  if (!text) return <span className={className}>{children}</span>
  return (
    <span className={cn("group/tip relative inline-block", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "bg-secondary text-secondary-foreground pointer-events-none absolute left-1/2 z-50 hidden w-max max-w-72 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-left text-xs font-normal whitespace-normal shadow-md group-focus-within/tip:block group-hover/tip:block",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {text}
        {/* a rotated square showing only its two outer borders, so the tail reads as one shape */}
        <span
          className={cn(
            "bg-secondary absolute left-1/2 size-2 -translate-x-1/2 rotate-45",
            side === "top" ? "-bottom-1 border-r border-b" : "-top-1 border-t border-l",
          )}
        />
      </span>
    </span>
  )
}
