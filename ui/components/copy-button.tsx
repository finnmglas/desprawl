// owner: finn
// goal: copy button

import { useEffect, useRef, useState } from "react"
import { Button } from "./button.tsx"
import { Check, Copy } from "./icons.tsx"
import { Tip } from "./tip.tsx"
import { toast } from "./toast.tsx"
import { copy } from "../lib/export.ts"

export function CopyButton({
  label = "Copy to the clipboard",
  text,
  message,
  note,
  className,
}: {
  label?: string
  /** lazy, a large payload is only built on click */
  text: () => string
  message: string
  note?: string
  className?: string
}) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <Tip text={done ? "Copied" : label} className={className}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={label}
        onClick={async () => {
          const ok = await copy(text())
          toast(ok ? message : "Copy blocked by the browser", note)
          if (!ok) return
          setDone(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setDone(false), 2000)
        }}
      >
        {done ? <Check /> : <Copy />}
      </Button>
    </Tip>
  )
}
