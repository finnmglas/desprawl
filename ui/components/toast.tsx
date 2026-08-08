// owner: finn
// goal: transient notices, sonner shaped
// inspo: sonner, shadcn

import * as React from "react"
import { cn } from "../lib/ui.ts"

export interface Toast {
  id: number
  message: string
  detail?: string
  variant?: "default" | "error"
}

let seq = 0
let publish: ((t: Toast) => void) | null = null

/** Fire a toast from anywhere. No-op until <Toaster /> is mounted. */
export const toast = (message: string, detail?: string, variant?: Toast["variant"]) =>
  publish?.({ id: ++seq, message, detail, variant })

export function Toaster({ timeout = 4000 }: { timeout?: number }) {
  const [items, setItems] = React.useState<Toast[]>([])

  React.useEffect(() => {
    publish = (t) => {
      setItems((prev) => [...prev, t])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== t.id)), timeout)
    }
    return () => {
      publish = null
    }
  }, [timeout])

  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
          className={cn(
            "bg-card animate-in slide-in-from-bottom-2 cursor-pointer rounded-md border px-3 py-2 shadow-lg",
            item.variant === "error" && "border-destructive/50",
          )}
        >
          <div className="text-sm font-medium">{item.message}</div>
          {item.detail && <div className="text-muted-foreground text-xs">{item.detail}</div>}
        </div>
      ))}
    </div>
  )
}
