// owner: finn
// goal: the older reading, asked for once

import { createContext, useContext, useEffect, useState } from "react"
import { wasBefore } from "./live.ts"
import { daysBack } from "../text/trend.ts"
import type { Compare } from "./display.tsx"
import type { Want, Was } from "../../../src/facts/before.ts"

interface Held {
  /** the window these belong to */
  days: number
  ask: (want: Want) => Was | null
}

const Ctx = createContext<Held>({ days: 0, ask: () => null })

/** one reading. Asking starts it and answers nothing, so a card waits without an arrow */
export function useWas(want: Want): Was | null {
  const { ask } = useContext(Ctx)
  return ask(want)
}

export function WasProvider({
  compare,
  children,
}: {
  compare: Compare
  children: React.ReactNode
}) {
  const days = daysBack(compare)
  const [held, setHeld] = useState<Record<string, Was | null>>({})
  const [asked, setAsked] = useState<Want[]>([])

  // a new window is a new set of readings
  useEffect(() => {
    setHeld({})
    setAsked([])
  }, [days])

  useEffect(() => {
    if (!days || !asked.length) return
    let live = true
    for (const want of asked) {
      if (`${days}:${want}` in held) continue
      void wasBefore(days, want).then((one) => {
        if (live) setHeld((was) => ({ ...was, [`${days}:${want}`]: one }))
      })
    }
    return () => {
      live = false
    }
  }, [days, asked, held])

  const ask = (want: Want) => {
    const key = `${days}:${want}`
    if (days && !asked.includes(want))
      // queued: this runs during a render
      queueMicrotask(() => setAsked((one) => (one.includes(want) ? one : [...one, want])))
    return held[key] ?? null
  }

  return <Ctx.Provider value={{ days, ask }}>{children}</Ctx.Provider>
}
