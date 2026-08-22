// owner: finn
// goal: the repo as it was, asked for once per window and reading, and only by whoever wants it

import { createContext, useContext, useEffect, useState } from "react"
import { wasBefore } from "./live.ts"
import { daysBack } from "../say/trend.ts"
import type { Compare } from "./display.tsx"
import type { Want, Was } from "../../../src/facts/before.ts"

interface Held {
  /** the window every reading here belongs to, so a late answer to an old one is dropped */
  days: number
  ask: (want: Want) => Was | null
}

const Ctx = createContext<Held>({ days: 0, ask: () => null })

/**
 * one reading of the older commit. Asking for one that has not arrived starts it and
 * answers nothing, so a card renders without an arrow until it is there
 */
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

  // a new window is a new set of readings: what was on screen belonged to the old one
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
      // during a render, so it lands on the next one rather than in the middle of this
      queueMicrotask(() => setAsked((one) => (one.includes(want) ? one : [...one, want])))
    return held[key] ?? null
  }

  return <Ctx.Provider value={{ days, ask }}>{children}</Ctx.Provider>
}
