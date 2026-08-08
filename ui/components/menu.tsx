// owner: finn
// goal: ellipsis popover

import { useEffect, useRef, useState } from "react"
import { Button } from "./button.tsx"
import { cn } from "../lib/ui.ts"

export function Menu({ children, className }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return
      if (e.type === "pointerdown" && box.current?.contains(e.target as globalThis.Node)) return
      setOpen(false)
    }
    addEventListener("pointerdown", close)
    addEventListener("keydown", close)
    return () => {
      removeEventListener("pointerdown", close)
      removeEventListener("keydown", close)
    }
  }, [open])

  return (
    <div ref={box} className={cn("relative", className)}>
      <Button variant="outline" size="icon" onClick={() => setOpen(!open)} title="More">
        ⋯
      </Button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="bg-card absolute right-0 z-40 mt-1 flex w-44 flex-col rounded-md border p-1 shadow-md"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="justify-start font-normal">
      {children}
    </Button>
  )
}
