// owner: finn
// goal: a handful of things, and the rest of them on ask

import { useState } from "react"
import { num } from "../../../lib/say/format.ts"

export const FEW = 6

export function Some({ children, few = 3 }: { children: React.ReactNode[]; few?: number }) {
  const [open, setOpen] = useState(false)
  const most = open ? Math.min(children.length, 120) : few
  const hidden = children.length - most
  const over = children.length > few
  return (
    <div className="flex flex-wrap items-center gap-1">
      {children.slice(0, most)}
      {over && (
        <button
          onClick={() => setOpen(!open)}
          className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-xs"
        >
          {open ? "show less" : `+${num(hidden)} more`}
        </button>
      )}
      {open && hidden > 0 && (
        <span className="text-muted-foreground px-1 text-xs">
          {num(hidden)} more in table below
        </span>
      )}
    </div>
  )
}
