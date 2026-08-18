// owner: finn
// goal: this part is refreshing

import { useEffect, useState } from "react"
import { cn } from "../../lib/app/ui.ts"

// a stall looks different from a finish
const STEPS = [1, 2, 3, 2]

// long enough that a request nobody waited for never says anything
const PATIENCE = 800

/** true once the wait is worth a word */
export function useSlow(on?: boolean): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!on) return
    const wait = setTimeout(() => setSlow(true), PATIENCE)
    return () => clearTimeout(wait)
  }, [on])
  return slow
}

/** the data stays, this says it will change */
export function Working({ on, className }: { on?: boolean; className?: string }) {
  const slow = useSlow(on)
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!slow) return
    const tick = setInterval(() => setStep((was) => (was + 1) % STEPS.length), 260)
    return () => clearInterval(tick)
  }, [slow])
  if (!slow) return null
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
