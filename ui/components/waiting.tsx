// owner: finn
// goal: waiting that shows it is still working, and roughly how long for

import { useEffect, useState } from "react"
import { cn } from "../lib/ui.ts"

/** seconds since this mounted, ticking, so a still page is never mistaken for a stuck one */
export function useWaited(): number {
  const [waited, setWaited] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const tick = setInterval(() => setWaited((Date.now() - start) / 1000), 100)
    return () => clearInterval(tick)
  }, [])
  return waited
}

export function Waiting({
  what,
  slow,
  rows = 3,
  className,
}: {
  what: string
  /** said once it has taken long enough that someone would wonder */
  slow?: string
  rows?: number
  className?: string
}) {
  const waited = useWaited()
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-muted-foreground text-sm">
        {what} <span className="tabular-nums">{waited.toFixed(1)}s</span>
        {slow && waited > 8 && <span className="block text-xs">{slow}</span>}
      </p>
      {/* the shape of what is coming, so the page does not jump when it lands */}
      <div aria-hidden className="flex animate-pulse flex-col gap-2">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex gap-2">
            {Array.from({ length: 4 - (row % 2) }, (_, box) => (
              <div
                key={box}
                style={{ flexGrow: 1 + ((row + box) % 3) }}
                className="bg-muted h-9 rounded-md"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
