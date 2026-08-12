// owner: finn
// goal: a filter that costs one button until somebody wants it

import { useRef, useState } from "react"
import { Button } from "../atoms/button.tsx"
import { Input } from "../atoms/input.tsx"
import { Search } from "../atoms/icons.tsx"
import { cn } from "../../lib/ui.ts"

export function Find({
  value,
  onChange,
  placeholder = "Find",
  className,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLInputElement>(null)

  if (!open && !value)
    return (
      // the same square as the save button it sits beside
      <Button
        variant="outline"
        size="icon"
        title={placeholder}
        aria-label={placeholder}
        className={cn("bg-card", className)}
        onClick={() => {
          setOpen(true)
          // the frame it is asked for is the frame before it exists
          requestAnimationFrame(() => box.current?.focus())
        }}
      >
        <Search className="size-4.5" />
      </Button>
    )
  return (
    <Input
      ref={box}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => !value && setOpen(false)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        onChange("")
        setOpen(false)
      }}
      placeholder={placeholder}
      className={cn("h-9 w-44", className)}
    />
  )
}
