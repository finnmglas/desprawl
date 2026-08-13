// owner: finn
// goal: one thing, opened over the page, closed by anything that means no

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { cn } from "../../lib/ui.ts"

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const shut = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    addEventListener("keydown", shut)
    return () => removeEventListener("keydown", shut)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 sm:p-8"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "bg-card my-auto flex w-full max-w-xl flex-col gap-3 rounded-lg border p-4 shadow-lg",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button
            onClick={onClose}
            title="Close, or press escape"
            className="text-muted-foreground hover:text-foreground -mt-1 cursor-pointer px-1 text-lg leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
