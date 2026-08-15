// owner: finn
// goal: hover message hint like shadcn but inverted

import { useRef, useState } from "react"
import { cn } from "../../lib/ui.ts"

const EDGE = 8

/** the nearest scrolling parent, or the window */
function frame(from: HTMLElement | null): {
  top: number
  bottom: number
  left: number
  right: number
} {
  for (let at = from?.parentElement; at; at = at.parentElement) {
    const flow = getComputedStyle(at).overflow
    if (flow !== "visible") {
      const box = at.getBoundingClientRect()
      return {
        top: Math.max(0, box.top),
        bottom: Math.min(innerHeight, box.bottom),
        left: Math.max(0, box.left),
        right: Math.min(innerWidth, box.right),
      }
    }
  }
  return { top: 0, bottom: innerHeight, left: 0, right: innerWidth }
}

export function Tip({
  text,
  side = "top",
  className,
  hoverOnly,
  children,
}: {
  text: React.ReactNode
  /** the side it prefers, which it gives up when that side has no room */
  side?: "top" | "bottom"
  className?: string
  /** no pointer to hover with, and a tap opens it elsewhere */
  hoverOnly?: boolean
  children: React.ReactNode
}) {
  const host = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  const [spot, setSpot] = useState(side)

  const place = () =>
    requestAnimationFrame(() => {
      const box = bubble.current?.getBoundingClientRect()
      const anchor = host.current?.getBoundingClientRect()
      if (!box || !anchor) return
      // a bubble past a table's edge widens what it scrolls to
      const cut = frame(host.current)
      const past = box.right > cut.right - EDGE ? cut.right - EDGE - box.right : 0
      const short = box.left < cut.left + EDGE ? cut.left + EDGE - box.left : 0
      setShift((was) => was + past + short)

      const needs = box.height + EDGE
      const above = anchor.top - cut.top
      const below = cut.bottom - anchor.bottom
      setSpot(
        side === "top"
          ? above < needs && below > above
            ? "bottom"
            : "top"
          : below < needs && above > below
            ? "top"
            : "bottom",
      )
    })

  // still wear the class, or a hintless label would style itself differently
  if (!text) return <span className={className}>{children}</span>
  return (
    <span
      ref={host}
      className={cn("group/tip relative inline-block", className)}
      onMouseEnter={place}
      onFocus={place}
    >
      {children}
      <span
        ref={bubble}
        role="tooltip"
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        className={cn(
          "bg-secondary text-secondary-foreground pointer-events-none absolute left-1/2 z-50 hidden w-max max-w-72 rounded-md border px-2.5 py-1.5 text-left text-xs font-normal whitespace-normal shadow-md group-focus-within/tip:block group-hover/tip:block",
          hoverOnly && "[@media(hover:none)]:!hidden",
          spot === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {text}
        {/* a rotated square showing only its two outer borders, so the tail reads as one shape.
            it stays under the thing being hovered, wherever the bubble slid to */}
        <span
          style={{ transform: `translateX(calc(-50% - ${shift}px)) rotate(45deg)` }}
          className={cn(
            "bg-secondary absolute left-1/2 size-2",
            spot === "top" ? "-bottom-1 border-r border-b" : "-top-1 border-t border-l",
          )}
        />
      </span>
    </span>
  )
}

export const Path = ({ of, as }: { of: string; as?: string }) => (
  <Tip className="max-w-96 min-w-0" text={of}>
    <span className="text-muted-foreground block truncate font-mono text-xs">{as ?? of}</span>
  </Tip>
)
