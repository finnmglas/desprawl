// owner: finn
// goal: ellipsis popover

import { useEffect, useRef, useState } from "react"
import { Button } from "./button.tsx"
import { cn } from "../lib/ui.ts"

export interface MenuProps {
  children: React.ReactNode
  className?: string
  /** Defaults to an ellipsis. */
  trigger?: React.ReactNode
  title?: string
  /** Return true to swallow the click, so a modified click can act instead of opening. */
  onTriggerClick?: (event: React.MouseEvent) => boolean
}

export function Menu({ children, className, trigger, title, onTriggerClick }: MenuProps) {
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
      <Button
        variant="outline"
        size="icon"
        title={title ?? "More"}
        onClick={(event) => {
          if (onTriggerClick?.(event)) return
          setOpen(!open)
        }}
      >
        {trigger ?? "⋯"}
      </Button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="bg-card absolute right-0 z-40 mt-1 flex w-72 flex-col rounded-md border p-1 shadow-md"
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A row that holds a control, so clicking inside it does not close the menu. */
export function MenuSection({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div onClick={(event) => event.stopPropagation()} className="flex flex-col gap-1 px-2 py-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
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
