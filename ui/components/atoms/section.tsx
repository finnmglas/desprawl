// owner: finn
// goal: delineate a panel, by an id

import { useEffect } from "react"
import { Caret, EyeOff, Grip } from "./icons.tsx"
import {
  dragOver,
  dragStart,
  tabOf,
  hits,
  panelOf,
  useDragging,
  useDropTarget,
  useHunt,
  useLanded,
  showing,
  useHidden,
  useOrder,
} from "../../lib/app/sections.ts"
import { cn } from "../../lib/app/ui.ts"

const control =
  "text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-30"

export function Section({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: React.ReactNode
}) {
  const said = useHunt()
  const [hidden, setHidden] = useHidden()
  const { list: order, move, drop } = useOrder(tabOf(id), hidden)
  const dragging = useDragging()
  const landed = useLanded()
  const target = useDropTarget()
  const panel = panelOf(id)
  const gone = hidden.includes(id) || (!!said && !(panel && hits(panel, said)))
  useEffect(() => {
    showing(id, !gone)
    return () => showing(id, false)
  }, [id, gone])
  if (gone) return null
  const visible = order.filter((one) => !hidden.includes(one))
  const at = visible.indexOf(id)
  return (
    <div
      data-section={id}
      style={{ order: order.indexOf(id) }}
      className={cn(
        "relative scroll-mt-1.5 transition-[opacity,box-shadow] duration-500",
        dragging === id && "opacity-40",
        landed === id && "ring-ring rounded-xl ring-2 ring-offset-2 ring-offset-transparent",
        className,
      )}
      onDragOver={(event) => {
        if (!dragging || dragging === id) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        dragOver(id, event.clientY > rect.top + rect.height / 2)
      }}
      onDrop={(event) => event.preventDefault()}
    >
      {/* the gap a drag would land in, drawn in the same colour as the text around it */}
      {target?.before === id && (
        <div
          className={cn(
            "bg-foreground pointer-events-none absolute inset-x-2 z-20 h-0.5 rounded-full",
            target.after ? "-bottom-2.5" : "-top-2.5",
          )}
        />
      )}
      {/* reordering a tab you cannot see is not a move anyone can follow */}
      {!said && (
        <div className="group/hide absolute -top-3 -right-3 z-10 flex h-9 w-36 items-start justify-end p-1.5">
          <div className="bg-card flex items-center gap-0.5 rounded-full border px-1 py-1 opacity-0 shadow-sm transition-opacity group-hover/hide:opacity-100 has-[:focus-visible]:opacity-100">
            <button
              onClick={() => move(id, -1)}
              disabled={at <= 0}
              title="Move up"
              className={cn(control, "cursor-pointer")}
            >
              <Caret className="size-3 rotate-180" />
            </button>
            <button
              onClick={() => move(id, 1)}
              disabled={at >= visible.length - 1}
              title="Move down"
              className={cn(control, "cursor-pointer")}
            >
              <Caret className="size-3" />
            </button>
            <span className="bg-border mx-0.5 h-4 w-px" />
            <button
              onClick={() => setHidden(id, true)}
              title="Hide this panel"
              className={cn(control, "cursor-pointer")}
            >
              <EyeOff className="size-3.5" />
            </button>
            <span
              draggable
              onDragStart={(event) => {
                // firefox drops the gesture unless dragstart carries data
                event.dataTransfer.setData("text/plain", id)
                dragStart(id)
              }}
              onDragEnd={drop}
              title="Drag to reorder"
              className={cn(control, "cursor-grab active:cursor-grabbing")}
            >
              <Grip />
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
