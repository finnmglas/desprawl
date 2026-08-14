// owner: finn
// goal: delineate a panel, so later work can reorder, hide or decorate it by id

import { Eye } from "./icons.tsx"
import { useHidden } from "../../lib/sections.ts"
import { cn } from "../../lib/ui.ts"

export function Section({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: React.ReactNode
}) {
  const [hidden, setHidden] = useHidden()
  if (hidden.includes(id)) return null
  return (
    <div data-section={id} className={cn("relative", className)}>
      <div className="group/hide absolute -top-3 -right-3 z-10 flex size-9 items-center justify-center">
        <button
          onClick={() => setHidden(id, true)}
          title="Hide this panel"
          className="bg-card text-muted-foreground hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover/hide:opacity-100 focus-visible:opacity-100"
        >
          <Eye className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}
