// owner: finn
// goal: this part is being refreshed, and what you are reading is the old answer

import { useEffect, useState } from "react"
import { cn } from "../lib/ui.ts"

// grows and shrinks, so a stalled request looks different from a finished one
const STEPS = [1, 2, 3, 2]

/** small on purpose: the data stays where it is, this only says it will change */
export function Working({ on, className }: { on?: boolean; className?: string }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!on) return
    const tick = setInterval(() => setStep((was) => (was + 1) % STEPS.length), 260)
    return () => clearInterval(tick)
  }, [on])
  if (!on) return null
  return (
    <span
      role="status"
      aria-label="refreshing"
      className={cn("text-muted-foreground w-3 text-sm leading-none", className)}
    >
      {".".repeat(STEPS[step])}
    </span>
  )
}
