// owner: finn
// goal: hover message hint like shadcn but inverted

import { useRef, useState } from "react"
import { cn } from "../lib/ui.ts"

const EDGE = 8

/** the box that would cut the bubble off: the nearest scrolling parent, or the window */
function frame(from: HTMLElement | null): { top: number; bottom: number } {
  for (let at = from?.parentElement; at; at = at.parentElement) {
    const flow = getComputedStyle(at).overflow
    if (flow !== "visible") {
      const box = at.getBoundingClientRect()
      return { top: Math.max(0, box.top), bottom: Math.min(innerHeight, box.bottom) }
    }
  }
  return { top: 0, bottom: innerHeight }
}

export function Tip({
  text,
  side = "top",
  className,
  children,
}: {
  text: React.ReactNode
  /** the side it prefers, which it gives up when that side has no room */
  side?: "top" | "bottom"
  className?: string
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
      const past = box.right > innerWidth - EDGE ? innerWidth - EDGE - box.right : 0
      const short = box.left < EDGE ? EDGE - box.left : 0
      setShift((was) => was + past + short)

      // a table wraps itself in an overflow box, so the row nearest its edge has
      // nowhere to put a bubble on the side it asked for. Take the side that fits
      const cut = frame(host.current)
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
