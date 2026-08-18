// owner: finn
// goal: transient notices, sonner shaped
// inspo: sonner, shadcn

import * as React from "react"
import { sink, type Toast } from "../../lib/app/toast.ts"
// the queue lives in lib, this stays where components look
export { toast } from "../../lib/app/toast.ts"
import { cn } from "../../lib/app/ui.ts"

export function Toaster({ timeout = 4000 }: { timeout?: number }) {
  const [items, setItems] = React.useState<Toast[]>([])

  React.useEffect(() => {
    sink((notice) => {
      setItems((prev) => [...prev, notice])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== notice.id)), timeout)
    })
    return () => sink(null)
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
