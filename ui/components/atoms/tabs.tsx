// owner: finn
// goal: one view at a time
// inspo: shadcn

import { useEffect, useRef } from "react"
import { cn } from "../../lib/app/ui.ts"

export interface TabsProps {
  /** Tab keys in display order, rendered as their own labels. */
  tabs: string[]
  value: string
  onChange: (tab: string) => void
  className?: string
  /** Share the full width instead of hugging the labels. */
  grow?: boolean
  /** a mark to the left of a label, where one helps */
  icons?: Record<string, React.ReactNode>
}

export function Tabs({ tabs, value, onChange, className, grow, icons }: TabsProps) {
  const strip = useRef<HTMLDivElement>(null)
  const here = useRef<HTMLButtonElement>(null)

  // the one you are on has to be on screen. scrollLeft, or the page jumps
  useEffect(() => {
    const box = strip.current
    const button = here.current
    if (!box || !button || box.scrollWidth <= box.clientWidth) return
    box.scrollTo({
      left: Math.max(0, button.offsetLeft - (box.clientWidth - button.clientWidth) / 2),
      behavior: "smooth",
    })
  }, [value])

  return (
    <div
      ref={strip}
      className={cn(
        // scrolls rather than overflowing: four tabs and their marks do not fit a phone
        "bg-muted text-muted-foreground inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        grow && "flex w-full",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          ref={tab === value ? here : undefined}
          onClick={() => onChange(tab)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
            grow && "flex-1",
            tab === value ? "bg-background text-foreground shadow-xs" : "hover:text-foreground",
          )}
        >
          {icons?.[tab]}
          {tab}
        </button>
      ))}
    </div>
  )
}
