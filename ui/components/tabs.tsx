// owner: finn
// goal: one view at a time
// inspo: shadcn

import { cn } from "../lib/ui.ts"

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
  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground inline-flex gap-1 rounded-lg p-1",
        grow && "flex w-full",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
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
